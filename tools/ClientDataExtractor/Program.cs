using CASCLib;
using DBCD.Providers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.RegularExpressions;

if (args.Length < 3) throw new ArgumentException("client-directory definitions-directory output-directory [comma-separated-tables] [comma-separated-locales]");
var client = Path.GetFullPath(args[0]).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
var definitions = Path.GetFullPath(args[1]);
var output = Path.GetFullPath(args[2]);
if (output.StartsWith(client + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) || output.Equals(client, StringComparison.OrdinalIgnoreCase))
    throw new ArgumentException("Output must be outside the client directory.");
Directory.CreateDirectory(output);
var build = "7.3.5.26972";
using var infoReader = File.OpenText(Path.Combine(client, ".build.info"));
var info = VerBarConfig.ReadVerBarConfig(infoReader);
var active = Enumerable.Range(0, info.Count).Select(i => info[i]).Single(x => x["Active"] == "1");
if (active["Version"] != build) throw new InvalidDataException("Only the reviewed 7.3.5.26972 build is supported.");
var requested = args.Length > 3 && !string.IsNullOrWhiteSpace(args[3]) ? args[3].Split(',').ToHashSet(StringComparer.OrdinalIgnoreCase) : null;
var locales = (args.Length > 4 ? args[4] : "zhCN").Split(',');
foreach (var locale in locales)
    if (locale is not ("zhCN" or "enUS" or "zhTW")) throw new ArgumentException("Unsupported locale.");
var tables = Directory.EnumerateFiles(definitions, "*.dbd").Where(p =>
    requested?.Contains(Path.GetFileNameWithoutExtension(p)) ?? Regex.IsMatch(File.ReadAllText(p).Split("\n\n")[0], @"(?m)^(?:locstring|string)\s+"))
    .Select(Path.GetFileNameWithoutExtension).Cast<string>().Order(StringComparer.Ordinal).ToArray();
var jsonOptions = new JsonSerializerOptions { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
var records = new List<object>();
var hasher = new Jenkins96();
CDNCache.Enabled = false;
CASCConfig.LoadFlags = LoadFlags.None;
CASCConfig.ValidateData = true;
CASCConfig.ThrowOnMissingDecryptionKey = true;
var config = CASCConfig.LoadLocalStorageConfig(client, "wow");
var casc = CASCHandler.OpenStorage(config);
try
{
    if (config.OnlineMode) throw new InvalidOperationException("Offline mode required.");
    foreach (var locale in locales)
    {
        casc.Root.SetFlags(Enum.Parse<LocaleFlags>(locale), createTree: false);
        var rawDirectory = Path.Combine(output, "raw", locale);
        var jsonDirectory = Path.Combine(output, "tables", locale);
        Directory.CreateDirectory(rawDirectory);
        Directory.CreateDirectory(jsonDirectory);
        var dbcd = new DBCD.DBCD(new FilesystemDBCProvider(rawDirectory), new FilesystemDBDProvider(definitions));
        foreach (var table in tables)
        {
            var names = table == "ItemSparse" ? new[] { "ItemSparse", "Item-sparse" } : new[] { table };
            string? archivePath = null;
            RootEntry? rootEntry = null;
            foreach (var name in names)
            {
                var candidate = $"DBFilesClient\\{name}.db2";
                var entries = casc.Root.GetEntries(hasher.ComputeHash(candidate)).ToArray();
                if (entries.Length == 0) continue;
                archivePath = candidate;
                rootEntry = entries[0];
                break;
            }
            if (archivePath == null || rootEntry == null) continue;
            var rawPath = Path.Combine(rawDirectory, table + ".db2");
            var ckey = rootEntry.Value.cKey.ToHexString().ToLowerInvariant();
            string? sha256 = null;
            long length = 0;
            try
            {
                // OpenFile uses the exact selected locale; the library's offline
                // fallback is patched to throw instead of silently downloading.
                using (var input = casc.OpenFile(archivePath))
                using (var destination = File.Create(rawPath)) input.CopyTo(destination);
                using (var input = File.OpenRead(rawPath))
                    if (Convert.ToHexString(MD5.HashData(input)).ToLowerInvariant() != ckey)
                        throw new InvalidDataException("CASC content-key verification failed.");
                using (var input = File.OpenRead(rawPath)) sha256 = Convert.ToHexString(SHA256.HashData(input)).ToLowerInvariant();
                length = new FileInfo(rawPath).Length;
                var storage = dbcd.Load(table, build);
                var columns = storage.AvailableColumns;
                var cnFields = 0;
                var strings = 0;
                using (var destination = File.Create(Path.Combine(jsonDirectory, table + ".json")))
                using (var writer = new Utf8JsonWriter(destination, new JsonWriterOptions { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping }))
                {
                    writer.WriteStartObject();
                    writer.WriteString("table", table);
                    writer.WriteString("build", build);
                    writer.WriteString("locale", locale);
                    writer.WriteString("cKey", ckey);
                    writer.WriteString("sha256", sha256);
                    writer.WriteString("layoutHash", storage.LayoutHash.ToString("X8"));
                    writer.WriteStartArray("columns");
                    foreach (var column in columns) writer.WriteStringValue(column);
                    writer.WriteEndArray();
                    writer.WriteStartArray("rows");
                    foreach (var id in storage.Keys.Order())
                    {
                        var row = storage[id];
                        writer.WriteStartObject();
                        if (!columns.Contains("ID")) writer.WriteNumber("ID", id);
                        foreach (var column in columns)
                        {
                            var value = row[column];
                            writer.WritePropertyName(column);
                            // System.Text.Json otherwise encodes byte[] as Base64.
                            // Keep all DB2 arrays as numeric arrays and retain exact
                            // 64-bit masks above JavaScript's safe integer range.
                            var jsonValue = NormalizeValue(value);
                            JsonSerializer.Serialize(writer, jsonValue, jsonValue?.GetType() ?? typeof(object), jsonOptions);
                            if (value is string text && text.Length > 0)
                            {
                                strings++;
                                if (Regex.IsMatch(text, @"[\u3400-\u9fff]")) cnFields++;
                            }
                        }
                        writer.WriteEndObject();
                    }
                    writer.WriteEndArray();
                    writer.WriteEndObject();
                }
                records.Add(new { table, locale, archivePath, cKey = ckey, sha256, length, rows = storage.Count, strings, chineseFields = cnFields, status = "exported" });
                Console.WriteLine($"OK {locale}/{table}: {storage.Count} rows, {cnFields} Chinese fields");
            }
            catch (Exception exception)
            {
                records.Add(new { table, locale, archivePath, cKey = ckey, sha256, length, status = "failed", error = exception.GetBaseException().Message });
                Console.WriteLine($"SKIP {locale}/{table}: {exception.GetBaseException().Message}");
            }
            // The parser builds runtime types per table. Release data between
            // large tables without retaining every localized database in RAM.
            if (length > 16 * 1024 * 1024) GC.Collect();
        }
    }
}
finally { casc.Clear(); }
File.WriteAllText(Path.Combine(output, "extraction-audit.json"), JsonSerializer.Serialize(new
{
    build, buildKey = active["BuildKey"], cdnKey = active["CDNKey"], rootCKey = config.RootCKey.ToHexString().ToLowerInvariant(),
    readOnly = true, networkFallback = false, tables = records
}, new JsonSerializerOptions(jsonOptions) { WriteIndented = true }), new UTF8Encoding(false));

static object? NormalizeValue(object? value) => value switch
{
    ulong number when number > 9007199254740991UL => number.ToString(System.Globalization.CultureInfo.InvariantCulture),
    long number when number > 9007199254740991L || number < -9007199254740991L => number.ToString(System.Globalization.CultureInfo.InvariantCulture),
    Array values => values.Cast<object>().Select(NormalizeValue).ToArray(),
    _ => value
};
