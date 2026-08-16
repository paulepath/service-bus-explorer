using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;
using ServiceBusExplorer.Core.Models;
using ServiceBusExplorer.Core.Services;
using ServiceBusExplorer.Discovery.Models;

namespace ServiceBusExplorer.Discovery.Providers;

public sealed class WslDockerDiscoveryProvider : IDiscoveryProvider
{
    private readonly ILogger<WslDockerDiscoveryProvider> _logger;

    public string ProviderName => "WSL/Docker Discovery";

    public WslDockerDiscoveryProvider(ILogger<WslDockerDiscoveryProvider> logger)
    {
        _logger = logger;
    }

    public async Task<IReadOnlyList<ConnectionProfile>> DiscoverAsync(CancellationToken ct = default)
    {
        var emulators = await DiscoverEmulatorsAsync(ct);

        var list = new List<ConnectionProfile>();
        foreach (var e in emulators)
        {
            var (queues, topics) = await ExtractEntitiesFromContainerAsync(e.ContainerId, ct);

            list.Add(new ConnectionProfile(
                Id: $"discovered-{e.ContainerId[..Math.Min(12, e.ContainerId.Length)]}",
                Name: $"{CleanName(e.ContainerName)} (localhost:{e.AmqpPort})",
                Type: ConnectionType.LocalEmulator,
                ConnectionString: e.ConnectionString,
                FullyQualifiedNamespace: "sbemulatorns",
                IsDiscovered: true,
                Capabilities: ServiceBusCapabilities.PeekMessages
                            | ServiceBusCapabilities.ReceiveMessages
                            | ServiceBusCapabilities.SendMessages
                            | ServiceBusCapabilities.ScheduleMessages
                            | ServiceBusCapabilities.DeadLetterQueue
                            | ServiceBusCapabilities.Sessions
                            | ServiceBusCapabilities.Purge
                            | ServiceBusCapabilities.SubscriptionRules,
                ConfiguredQueues: queues,
                ConfiguredTopics: topics
            ));
        }

        return list;
    }

    public async Task<IReadOnlyList<DiscoveredEmulator>> DiscoverEmulatorsAsync(CancellationToken ct = default)
    {
        var results = new List<DiscoveredEmulator>();

        try
        {
            string output = await RunCommandAsync("docker ps --format \"{{json .}}\"", ct);
            if (string.IsNullOrWhiteSpace(output))
                return results;

            var lines = output.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);

            foreach (var line in lines)
            {
                try
                {
                    using var doc = JsonDocument.Parse(line);
                    var root = doc.RootElement;

                    string image = root.TryGetProperty("Image", out var imgProp) ? imgProp.GetString() ?? "" : "";
                    string id = root.TryGetProperty("ID", out var idProp) ? idProp.GetString() ?? "" : "";
                    string names = root.TryGetProperty("Names", out var nameProp) ? nameProp.GetString() ?? "" : "";
                    string status = root.TryGetProperty("Status", out var statusProp) ? statusProp.GetString() ?? "" : "";
                    string ports = root.TryGetProperty("Ports", out var portProp) ? portProp.GetString() ?? "" : "";

                    if (!image.Contains("servicebus-emulator", StringComparison.OrdinalIgnoreCase) &&
                        !names.Contains("servicebus-emulator", StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    int amqpPort = ExtractHostPort(ports, targetContainerPort: 5672, defaultHostPort: 5672);
                    int? mgmtPort = ExtractNullableHostPort(ports, targetContainerPort: 5300);

                    string connectionString = $"Endpoint=sb://127.0.0.1:{amqpPort};SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=SAS_KEY_VALUE;UseDevelopmentEmulator=true;";
                    bool isHealthy = status.Contains("Up", StringComparison.OrdinalIgnoreCase) && !status.Contains("unhealthy", StringComparison.OrdinalIgnoreCase);

                    results.Add(new DiscoveredEmulator(
                        ContainerId: id,
                        ContainerName: names,
                        Distro: RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "WSL2" : "Host",
                        Image: image,
                        Status: status,
                        AmqpPort: amqpPort,
                        ManagementPort: mgmtPort,
                        ConnectionString: connectionString,
                        IsHealthy: isHealthy
                    ));
                }
                catch (Exception ex)
                {
                    _logger.LogDebug(ex, "Failed to parse docker container json line: {Line}", line);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Docker discovery scan encountered an error.");
        }

        return results;
    }

    private async Task<(List<ConfiguredQueue> Queues, List<ConfiguredTopic> Topics)> ExtractEntitiesFromContainerAsync(string containerId, CancellationToken ct)
    {
        var queues = new List<ConfiguredQueue>();
        var topics = new List<ConfiguredTopic>();

        try
        {
            // First check if mount path exists and is accessible directly
            string inspectOutput = await RunCommandAsync($"docker inspect {containerId} --format \"{{{{json .Mounts}}}}\"", ct);
            string? hostMountPath = null;

            if (!string.IsNullOrWhiteSpace(inspectOutput))
            {
                try
                {
                    using var doc = JsonDocument.Parse(inspectOutput.Trim());
                    foreach (var elem in doc.RootElement.EnumerateArray())
                    {
                        string dest = elem.TryGetProperty("Destination", out var d) ? d.GetString() ?? "" : "";
                        if (dest.EndsWith("Config.json", StringComparison.OrdinalIgnoreCase))
                        {
                            hostMountPath = elem.TryGetProperty("Source", out var s) ? s.GetString() : null;
                            break;
                        }
                    }
                }
                catch
                {
                    // Ignore
                }
            }

            string? configJsonContent = null;
            if (hostMountPath != null)
            {
                // Convert /mnt/d/... to D:\... if on Windows
                string winPath = hostMountPath;
                if (winPath.StartsWith("/mnt/") && winPath.Length > 6)
                {
                    char drive = char.ToUpperInvariant(winPath[5]);
                    winPath = $"{drive}:{winPath[6..].Replace('/', '\\')}";
                }

                if (File.Exists(winPath))
                {
                    configJsonContent = await File.ReadAllTextAsync(winPath, ct);
                }
            }

            if (configJsonContent == null)
            {
                // Fallback to docker cp
                string tarOutput = await RunCommandAsync($"docker cp {containerId}:/ServiceBus_Emulator/ConfigFiles/Config.json -", ct);
                int jsonStart = tarOutput.IndexOf('{');
                int jsonEnd = tarOutput.LastIndexOf('}');
                if (jsonStart >= 0 && jsonEnd > jsonStart)
                {
                    configJsonContent = tarOutput.Substring(jsonStart, jsonEnd - jsonStart + 1);
                }
            }

            if (!string.IsNullOrWhiteSpace(configJsonContent))
            {
                using var doc = JsonDocument.Parse(configJsonContent);
                var root = doc.RootElement;
                if (root.TryGetProperty("UserConfig", out var userConfig) &&
                    userConfig.TryGetProperty("Namespaces", out var namespaces))
                {
                    foreach (var ns in namespaces.EnumerateArray())
                    {
                        if (ns.TryGetProperty("Queues", out var qList))
                        {
                            foreach (var q in qList.EnumerateArray())
                            {
                                string qName = q.GetProperty("Name").GetString() ?? "";
                                bool requiresSession = false;
                                int maxDelivery = 10;

                                if (q.TryGetProperty("Properties", out var props))
                                {
                                    if (props.TryGetProperty("RequiresSession", out var sess) && sess.ValueKind == JsonValueKind.True)
                                        requiresSession = true;
                                    if (props.TryGetProperty("MaxDeliveryCount", out var max) && max.TryGetInt32(out int m))
                                        maxDelivery = m;
                                }

                                queues.Add(new ConfiguredQueue(
                                    Name: qName,
                                    RequiresSession: requiresSession,
                                    MaxDeliveryCount: maxDelivery
                                ));
                            }
                        }

                        if (ns.TryGetProperty("Topics", out var tList))
                        {
                            foreach (var t in tList.EnumerateArray())
                            {
                                string tName = t.GetProperty("Name").GetString() ?? "";
                                var subs = new List<ConfiguredSubscription>();

                                if (t.TryGetProperty("Subscriptions", out var sList))
                                {
                                    foreach (var s in sList.EnumerateArray())
                                    {
                                        string sName = s.GetProperty("Name").GetString() ?? "";
                                        var rules = new List<SubscriptionRuleSummary>();

                                        if (s.TryGetProperty("Rules", out var rList))
                                        {
                                            foreach (var r in rList.EnumerateArray())
                                            {
                                                string rName = r.GetProperty("Name").GetString() ?? "";
                                                rules.Add(new SubscriptionRuleSummary(rName, "Filter", null, null));
                                            }
                                        }

                                        subs.Add(new ConfiguredSubscription(sName, rules));
                                    }
                                }

                                topics.Add(new ConfiguredTopic(tName, subs));
                            }
                        }
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Could not extract entities from emulator {ContainerId}", containerId);
        }

        return (queues, topics);
    }

    private async Task<string> RunCommandAsync(string dockerArgs, CancellationToken ct)
    {
        var psi = new ProcessStartInfo
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            psi.FileName = "wsl.exe";
            psi.Arguments = dockerArgs;
        }
        else
        {
            psi.FileName = "docker";
            psi.Arguments = dockerArgs.StartsWith("docker ") ? dockerArgs[7..] : dockerArgs;
        }

        using var process = Process.Start(psi);
        if (process == null) return string.Empty;

        string output = await process.StandardOutput.ReadToEndAsync(ct);
        await process.WaitForExitAsync(ct);

        return output;
    }

    private static int ExtractHostPort(string portsString, int targetContainerPort, int defaultHostPort)
    {
        var match = Regex.Match(portsString, $@"(?:0\.0\.0\.0|127\.0\.0\.1|::):(\d+)->{targetContainerPort}/tcp");
        if (match.Success && int.TryParse(match.Groups[1].Value, out int port))
        {
            return port;
        }
        return defaultHostPort;
    }

    private static int? ExtractNullableHostPort(string portsString, int targetContainerPort)
    {
        var match = Regex.Match(portsString, $@"(?:0\.0\.0\.0|127\.0\.0\.1|::):(\d+)->{targetContainerPort}/tcp");
        if (match.Success && int.TryParse(match.Groups[1].Value, out int port))
        {
            return port;
        }
        return null;
    }

    private static string CleanName(string rawName)
    {
        return rawName.TrimStart('/');
    }
}
