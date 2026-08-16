import { test, expect } from '@playwright/test';

test.describe('Queue Lifecycle & Messaging E2E Tests', () => {
  let connectionId: string;
  let targetQueue: string = 'normal-queue';
  const newQueueName = `pw-test-queue-${Date.now()}`;

  test.beforeAll(async ({ request }) => {
    // 1. Discover local emulator connections
    const discoverRes = await request.post('/api/connections/discover');
    expect(discoverRes.ok()).toBeTruthy();
    const conns = await discoverRes.json();
    expect(conns.length).toBeGreaterThan(0);
    connectionId = conns[0].id;

    const listRes = await request.get(`/api/connections/${connectionId}/queues`);
    const queues = await listRes.json();
    if (queues.length > 0) {
      targetQueue = queues[0].name;
    }
    console.log(`Using connection: ${conns[0].name} (${connectionId}), queue: ${targetQueue}`);
  });

  test('1. Create queue with custom lock duration (number format: 60)', async ({ request }) => {
    const createRes = await request.post(`/api/connections/${connectionId}/queues`, {
      data: {
        name: newQueueName,
        maxDeliveryCount: 5,
        lockDuration: 60,
        requiresSession: false,
        deadLetteringOnMessageExpiration: false,
      },
    });

    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    expect(created.name).toBe(newQueueName);
    expect(created.maxDeliveryCount).toBe(5);
  });

  test('2. Verify queue appears in list', async ({ request }) => {
    const listRes = await request.get(`/api/connections/${connectionId}/queues`);
    expect(listRes.ok()).toBeTruthy();
    const queues = await listRes.json();
    const found = queues.find((q: any) => q.name === newQueueName);
    expect(found).toBeDefined();
    expect(found.name).toBe(newQueueName);
  });

  test('3. Send and peek message in active emulator queue', async ({ request }) => {
    const testMessageId = `msg-${Date.now()}`;
    const sendRes = await request.post(
      `/api/connections/${connectionId}/queues/${targetQueue}/messages/send`,
      {
        data: {
          messageId: testMessageId,
          subject: 'PlaywrightTestMessage',
          body: JSON.stringify({ event: 'QueueVerified', timestamp: new Date().toISOString() }),
          format: 'Json',
          applicationProperties: {
            source: 'playwright-e2e',
            testRun: true,
          },
        },
      }
    );

    if (!sendRes.ok()) {
      console.error('Send failed:', await sendRes.text());
    }
    expect(sendRes.ok()).toBeTruthy();
    const sendResult = await sendRes.json();
    expect(sendResult.success).toBe(true);

    // Peek message
    const peekRes = await request.get(
      `/api/connections/${connectionId}/queues/${targetQueue}/messages?count=10`
    );
    expect(peekRes.ok()).toBeTruthy();
    const messages = await peekRes.json();
    const foundMsg = messages.find((m: any) => m.messageId === testMessageId);
    expect(foundMsg).toBeDefined();
    expect(foundMsg.subject).toBe('PlaywrightTestMessage');
    expect(foundMsg.applicationProperties.source).toBe('playwright-e2e');
  });

  test('4. Delete created queue and verify removal', async ({ request }) => {
    const delRes = await request.delete(`/api/connections/${connectionId}/queues/${newQueueName}`);
    expect(delRes.ok()).toBeTruthy();

    const listRes = await request.get(`/api/connections/${connectionId}/queues`);
    const queues = await listRes.json();
    const found = queues.find((q: any) => q.name === newQueueName);
    expect(found).toBeUndefined();
  });
});
