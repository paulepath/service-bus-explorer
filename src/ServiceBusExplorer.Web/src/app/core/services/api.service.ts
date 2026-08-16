import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  ConnectionProfile,
  DiscoveredEmulator,
  NamespaceOverview,
  QueueSummary,
  TopicSummary,
  SubscriptionSummary,
  EntityRuntimeCounts,
  ServiceBusMessageDto,
  SendMessageRequest,
  SendMessageResult,
  ResendDeadLetterRequest,
  ResendDeadLetterResult,
  CreateQueueRequest,
  CreateTopicRequest,
  CreateSubscriptionRequest,
  SelectedEntity
} from '../models/service-bus.models';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private http = inject(HttpClient);
  // Default to localhost:5000 or relative url if hosted together
  private baseUrl = window.location.port === '4200' ? 'http://localhost:5000' : '';

  // Encode entity name so / and \ in names don't corrupt URL path routing
  private enc(name: string): string {
    return encodeURIComponent(name);
  }

  getDiscoveredEmulators(): Observable<DiscoveredEmulator[]> {
    return this.http.get<DiscoveredEmulator[]>(`${this.baseUrl}/api/discovery/emulators`);
  }

  getConnections(): Observable<ConnectionProfile[]> {
    return this.http.get<ConnectionProfile[]>(`${this.baseUrl}/api/connections`);
  }

  addConnection(connection: Partial<ConnectionProfile>): Observable<ConnectionProfile> {
    return this.http.post<ConnectionProfile>(`${this.baseUrl}/api/connections`, connection);
  }

  discoverAndRegister(): Observable<ConnectionProfile[]> {
    return this.http.post<ConnectionProfile[]>(`${this.baseUrl}/api/connections/discover`, {});
  }

  deleteConnection(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/api/connections/${id}`);
  }

  getNamespaceOverview(connectionId: string): Observable<NamespaceOverview> {
    return this.http.get<NamespaceOverview>(`${this.baseUrl}/api/connections/${connectionId}/overview`);
  }

  getQueues(connectionId: string): Observable<QueueSummary[]> {
    return this.http.get<QueueSummary[]>(`${this.baseUrl}/api/connections/${connectionId}/queues`);
  }

  createQueue(connectionId: string, request: CreateQueueRequest): Observable<QueueSummary> {
    return this.http.post<QueueSummary>(`${this.baseUrl}/api/connections/${connectionId}/queues`, request);
  }

  deleteQueue(connectionId: string, queueName: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/api/connections/${connectionId}/queues/${this.enc(queueName)}`);
  }

  getTopics(connectionId: string): Observable<TopicSummary[]> {
    return this.http.get<TopicSummary[]>(`${this.baseUrl}/api/connections/${connectionId}/topics`);
  }

  createTopic(connectionId: string, request: CreateTopicRequest): Observable<TopicSummary> {
    return this.http.post<TopicSummary>(`${this.baseUrl}/api/connections/${connectionId}/topics`, request);
  }

  deleteTopic(connectionId: string, topicName: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/api/connections/${connectionId}/topics/${this.enc(topicName)}`);
  }

  createSubscription(connectionId: string, topicName: string, request: CreateSubscriptionRequest): Observable<SubscriptionSummary> {
    return this.http.post<SubscriptionSummary>(`${this.baseUrl}/api/connections/${connectionId}/topics/${this.enc(topicName)}/subscriptions`, request);
  }

  deleteSubscription(connectionId: string, topicName: string, subscriptionName: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/api/connections/${connectionId}/topics/${this.enc(topicName)}/subscriptions/${this.enc(subscriptionName)}`);
  }

  getEntityCounts(connectionId: string, entity: SelectedEntity): Observable<EntityRuntimeCounts> {
    if (entity.type === 'queue') {
      return this.http.get<EntityRuntimeCounts>(
        `${this.baseUrl}/api/connections/${connectionId}/queues/${this.enc(entity.name)}/counts`
      );
    } else {
      return this.http.get<EntityRuntimeCounts>(
        `${this.baseUrl}/api/connections/${connectionId}/topics/${this.enc(entity.topicName!)}/subscriptions/${this.enc(entity.subscriptionName!)}/counts`
      );
    }
  }

  getMessages(
    connectionId: string,
    entity: SelectedEntity,
    subQueue: number = 0,
    count: number = 50,
    fromSeq?: number
  ): Observable<ServiceBusMessageDto[]> {
    const params: Record<string, string | number> = { subQueue, count };
    if (fromSeq) params['fromSeq'] = fromSeq;

    if (entity.type === 'queue') {
      return this.http.get<ServiceBusMessageDto[]>(
        `${this.baseUrl}/api/connections/${connectionId}/queues/${this.enc(entity.name)}/messages`,
        { params }
      );
    } else {
      return this.http.get<ServiceBusMessageDto[]>(
        `${this.baseUrl}/api/connections/${connectionId}/topics/${this.enc(entity.topicName!)}/subscriptions/${this.enc(entity.subscriptionName!)}/messages`,
        { params }
      );
    }
  }

  sendMessage(connectionId: string, entity: SelectedEntity, request: SendMessageRequest): Observable<SendMessageResult> {
    const targetPath = entity.type === 'queue'
      ? `queues/${this.enc(entity.name)}`
      : `topics/${this.enc(entity.topicName || entity.name)}`;

    return this.http.post<SendMessageResult>(
      `${this.baseUrl}/api/connections/${connectionId}/${targetPath}/messages/send`,
      request
    );
  }

  resendDeadLetter(connectionId: string, entity: SelectedEntity, request: ResendDeadLetterRequest): Observable<ResendDeadLetterResult> {
    const targetPath = entity.type === 'queue'
      ? `queues/${this.enc(entity.name)}/deadletters/resend`
      : `topics/${this.enc(entity.topicName!)}/subscriptions/${this.enc(entity.subscriptionName!)}/deadletters/resend`;

    return this.http.post<ResendDeadLetterResult>(
      `${this.baseUrl}/api/connections/${connectionId}/${targetPath}`,
      request
    );
  }

  cancelScheduled(connectionId: string, entity: SelectedEntity, sequenceNumber: number): Observable<void> {
    const targetPath = entity.type === 'queue'
      ? `queues/${this.enc(entity.name)}/messages/scheduled/${sequenceNumber}`
      : `topics/${this.enc(entity.topicName!)}/messages/scheduled/${sequenceNumber}`;

    return this.http.delete<void>(`${this.baseUrl}/api/connections/${connectionId}/${targetPath}`);
  }

  purgeMessages(connectionId: string, entity: SelectedEntity, subQueue: number = 0, maxCount: number = 1000): Observable<{ purgedCount: number }> {
    const targetPath = entity.type === 'queue'
      ? `queues/${this.enc(entity.name)}/purge`
      : `topics/${this.enc(entity.topicName!)}/subscriptions/${this.enc(entity.subscriptionName!)}/purge`;

    return this.http.post<{ purgedCount: number }>(
      `${this.baseUrl}/api/connections/${connectionId}/${targetPath}?subQueue=${subQueue}&maxCount=${maxCount}`,
      {}
    );
  }
}
