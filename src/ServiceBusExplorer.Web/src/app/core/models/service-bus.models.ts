export interface ConnectionProfile {
  id: string;
  name: string;
  type: 'LocalEmulator' | 'AzureConnectionString' | 'AzureCredential';
  connectionString?: string;
  fullyQualifiedNamespace?: string;
  isDiscovered: boolean;
  capabilities: number;
}

export interface DiscoveredEmulator {
  containerId: string;
  containerName: string;
  distro?: string;
  image: string;
  status: string;
  amqpPort: number;
  managementPort?: number;
  connectionString: string;
  isHealthy: boolean;
}

export interface EntityRuntimeCounts {
  activeMessageCount: number;
  deadLetterMessageCount: number;
  scheduledMessageCount: number;
  transferDeadLetterMessageCount: number;
  totalMessageCount: number;
  retrievedAt: string;
}

export interface QueueSummary {
  name: string;
  counts: EntityRuntimeCounts;
  lockDuration: string;
  maxDeliveryCount: number;
  requiresSession: boolean;
  deadLetteringOnMessageExpiration: boolean;
  defaultMessageTimeToLive: string;
  createdAt: string;
  updatedAt: string;
  status: string;
}

export interface SubscriptionRuleSummary {
  name: string;
  filterType: string;
  filterExpression?: string;
  actionExpression?: string;
}

export interface SubscriptionSummary {
  topicName: string;
  subscriptionName: string;
  counts: EntityRuntimeCounts;
  lockDuration: string;
  maxDeliveryCount: number;
  requiresSession: boolean;
  deadLetteringOnMessageExpiration: boolean;
  defaultMessageTimeToLive: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  rules: SubscriptionRuleSummary[];
}

export interface TopicSummary {
  name: string;
  sizeInBytes: number;
  createdAt: string;
  updatedAt: string;
  status: string;
  subscriptions: SubscriptionSummary[];
}

export interface NamespaceOverview {
  name: string;
  queueCount: number;
  topicCount: number;
  subscriptionCount: number;
  totalActiveMessages: number;
  totalDeadLetterMessages: number;
}

export interface CreateQueueRequest {
  name: string;
  maxDeliveryCount?: number;
  lockDuration?: string;
  requiresSession?: boolean;
  deadLetteringOnMessageExpiration?: boolean;
}

export interface CreateTopicRequest {
  name: string;
  maxSizeInMegabytes?: number;
}

export interface CreateSubscriptionRequest {
  subscriptionName: string;
  maxDeliveryCount?: number;
  lockDuration?: string;
  requiresSession?: boolean;
  deadLetteringOnMessageExpiration?: boolean;
}

export type MessagePayloadFormat = 'Json' | 'Xml' | 'PlainText' | 'Binary' | 'Base64' | 'Jwt';

export interface ServiceBusMessageDto {
  messageId: string;
  correlationId?: string;
  subject?: string;
  contentType?: string;
  to?: string;
  replyTo?: string;
  replyToSessionId?: string;
  sessionId?: string;
  partitionKey?: string;
  transactionPartitionKey?: string;
  timeToLive?: string;
  scheduledEnqueueTime?: string;
  enqueuedTime?: string;
  sequenceNumber?: number;
  deliveryCount: number;
  lockToken?: string;
  lockedUntil?: string;
  deadLetterReason?: string;
  deadLetterErrorDescription?: string;
  deadLetterSource?: string;
  applicationProperties: Record<string, any>;
  rawBody: string;
  textBody?: string;
  detectedFormat: MessagePayloadFormat;
}

export interface SendMessageRequest {
  body: string;
  format?: MessagePayloadFormat;
  messageId?: string;
  correlationId?: string;
  subject?: string;
  contentType?: string;
  to?: string;
  replyTo?: string;
  replyToSessionId?: string;
  sessionId?: string;
  partitionKey?: string;
  timeToLive?: string;
  scheduledEnqueueTime?: string;
  applicationProperties?: Record<string, any>;
}

export interface SendMessageResult {
  success: boolean;
  messageId: string;
  sequenceNumber?: number;
  errorMessage?: string;
}

export interface ResendDeadLetterRequest {
  sequenceNumber: number;
  targetQueueOrTopic?: string;
  removeOriginal?: boolean;
  modifiedMessage?: SendMessageRequest;
}

export interface ResendDeadLetterResult {
  success: boolean;
  messageId: string;
  originalRemoved: boolean;
  errorMessage?: string;
}

export interface DeleteMessagesRequest {
  sequenceNumbers: number[];
  subQueue?: number;
}

export interface DeleteMessagesResult {
  requestedCount: number;
  deletedCount: number;
  success: boolean;
  errorMessage?: string;
}

export interface SelectedEntity {
  type: 'queue' | 'topic' | 'subscription';
  name: string;
  topicName?: string;
  subscriptionName?: string;
  counts?: EntityRuntimeCounts;
}

