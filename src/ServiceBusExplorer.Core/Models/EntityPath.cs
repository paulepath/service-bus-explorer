namespace ServiceBusExplorer.Core.Models;

public enum EntityType
{
    Queue,
    Topic,
    Subscription
}

public enum SubQueueType
{
    None = 0,
    DeadLetter = 1,
    TransferDeadLetter = 2
}

public sealed record EntityPath
{
    public EntityType Type { get; }
    public string Name { get; }
    public string? TopicName { get; }
    public string? SubscriptionName { get; }

    private EntityPath(EntityType type, string name, string? topicName = null, string? subscriptionName = null)
    {
        Type = type;
        Name = name;
        TopicName = topicName;
        SubscriptionName = subscriptionName;
    }

    public static EntityPath ForQueue(string queueName) =>
        new(EntityType.Queue, Uri.UnescapeDataString(queueName));

    public static EntityPath ForTopic(string topicName) =>
        new(EntityType.Topic, Uri.UnescapeDataString(topicName));

    public static EntityPath ForSubscription(string topicName, string subscriptionName)
    {
        var decodedTopic = Uri.UnescapeDataString(topicName);
        var decodedSub = Uri.UnescapeDataString(subscriptionName);
        return new(EntityType.Subscription, $"{decodedTopic}/Subscriptions/{decodedSub}", decodedTopic, decodedSub);
    }

    public override string ToString() => Name;
}
