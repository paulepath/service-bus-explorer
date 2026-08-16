import { test, expect } from '@playwright/test';

test.describe('Topic & Subscription Lifecycle E2E Tests', () => {
  let connectionId: string;
  const topicName = `pw-topic-${Date.now()}`;
  const subName = `pw-sub-${Date.now()}`;

  test.beforeAll(async ({ request }) => {
    const discoverRes = await request.post('/api/connections/discover');
    expect(discoverRes.ok()).toBeTruthy();
    const conns = await discoverRes.json();
    expect(conns.length).toBeGreaterThan(0);
    connectionId = conns[0].id;
  });

  test('1. Create topic', async ({ request }) => {
    const createTopicRes = await request.post(`/api/connections/${connectionId}/topics`, {
      data: {
        name: topicName,
        maxSizeInMegabytes: 1024,
      },
    });

    expect(createTopicRes.status()).toBe(201);
    const topic = await createTopicRes.json();
    expect(topic.name).toBe(topicName);
  });

  test('2. Create subscription on topic with custom lock duration', async ({ request }) => {
    const createSubRes = await request.post(
      `/api/connections/${connectionId}/topics/${topicName}/subscriptions`,
      {
        data: {
          subscriptionName: subName,
          maxDeliveryCount: 10,
          lockDuration: 45,
          requiresSession: false,
          deadLetteringOnMessageExpiration: false,
        },
      }
    );

    expect(createSubRes.status()).toBe(201);
    const sub = await createSubRes.json();
    expect(sub.subscriptionName).toBe(subName);
    expect(sub.topicName).toBe(topicName);
  });

  test('3. Verify topics list includes new topic', async ({ request }) => {
    const topicsRes = await request.get(`/api/connections/${connectionId}/topics`);
    expect(topicsRes.ok()).toBeTruthy();
    const topics = await topicsRes.json();
    const found = topics.find((t: any) => t.name === topicName);
    expect(found).toBeDefined();
    expect(found.subscriptions.some((s: any) => s.subscriptionName === subName)).toBe(true);
  });

  test('4. Delete subscription and topic', async ({ request }) => {
    // Delete subscription
    const delSubRes = await request.delete(
      `/api/connections/${connectionId}/topics/${topicName}/subscriptions/${subName}`
    );
    expect(delSubRes.ok()).toBeTruthy();

    // Delete topic
    const delTopicRes = await request.delete(
      `/api/connections/${connectionId}/topics/${topicName}`
    );
    expect(delTopicRes.ok()).toBeTruthy();
  });
});
