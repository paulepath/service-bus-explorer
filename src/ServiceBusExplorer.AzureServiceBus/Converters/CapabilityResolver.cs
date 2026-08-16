using ServiceBusExplorer.Core.Models;

namespace ServiceBusExplorer.AzureServiceBus.Converters;

public static class CapabilityResolver
{
    public static ServiceBusCapabilities Resolve(ConnectionType type, string? connectionString)
    {
        if (type == ConnectionType.LocalEmulator ||
            (connectionString is not null && connectionString.Contains("UseDevelopmentEmulator=true", StringComparison.OrdinalIgnoreCase)))
        {
            // Emulator capabilities
            return ServiceBusCapabilities.PeekMessages
                 | ServiceBusCapabilities.ReceiveMessages
                 | ServiceBusCapabilities.SendMessages
                 | ServiceBusCapabilities.ScheduleMessages
                 | ServiceBusCapabilities.DeadLetterQueue
                 | ServiceBusCapabilities.Sessions
                 | ServiceBusCapabilities.Purge
                 | ServiceBusCapabilities.SubscriptionRules;
        }

        // Full Azure Service Bus Cloud Namespace
        return ServiceBusCapabilities.PeekMessages
             | ServiceBusCapabilities.ReceiveMessages
             | ServiceBusCapabilities.SendMessages
             | ServiceBusCapabilities.ScheduleMessages
             | ServiceBusCapabilities.DeadLetterQueue
             | ServiceBusCapabilities.Administration
             | ServiceBusCapabilities.Sessions
             | ServiceBusCapabilities.SubscriptionRules
             | ServiceBusCapabilities.Purge
             | ServiceBusCapabilities.Deferred;
    }
}
