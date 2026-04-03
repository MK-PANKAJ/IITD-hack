// =============================================================================
// CloudGreen OS — Kafka Producer for Carbon Events
// Publishes CarbonEvent messages to the carbon-events topic via KafkaJS.
// Connects to the Strimzi-managed broker inside the k3s cluster.
// =============================================================================

import { Kafka, type Producer, type KafkaConfig, CompressionTypes } from "kafkajs";
import type { AppConfig } from "./config.js";
import type { CarbonEvent, CarbonIntensityResult } from "./types.js";
import { randomUUID } from "node:crypto";

export class CarbonEventProducer {
  private readonly kafka: Kafka;
  private producer: Producer | null = null;
  private readonly topic: string;
  private connected = false;

  constructor(private readonly config: AppConfig) {
    this.topic = config.KAFKA_TOPIC;

    const kafkaConfig: KafkaConfig = {
      clientId: config.KAFKA_CLIENT_ID,
      brokers: config.KAFKA_BROKERS.split(",").map((b) => b.trim()),
      connectionTimeout: 10_000,
      requestTimeout: 30_000,
      retry: {
        initialRetryTime: 1000,
        retries: 5,
        maxRetryTime: 30_000,
        factor: 2,
      },
    };

    this.kafka = new Kafka(kafkaConfig);
  }

  /**
   * Connect the producer to the Kafka cluster.
   * Idempotent — safe to call multiple times.
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    this.producer = this.kafka.producer({
      allowAutoTopicCreation: false, // Topic governance — topic must be pre-created
      idempotent: true,
      maxInFlightRequests: 1,
    });

    await this.producer.connect();
    this.connected = true;

    console.info(
      `[Kafka] Producer connected to ${this.config.KAFKA_BROKERS} → topic: ${this.topic}`
    );
  }

  /**
   * Publish a CarbonIntensityResult as a structured CarbonEvent to Kafka.
   *
   * Message key: bidding zone (ensures all events for same zone go to same partition)
   * Compression: LZ4 (matches broker config)
   */
  async publish(result: CarbonIntensityResult): Promise<void> {
    if (!this.producer || !this.connected) {
      throw new Error("Producer is not connected. Call connect() first.");
    }

    const event: CarbonEvent = {
      eventId: randomUUID(),
      eventType: "carbon-intensity-update",
      version: "1.0.0",
      producedAt: new Date().toISOString(),
      payload: result,
    };

    const message = {
      key: result.zone,
      value: JSON.stringify(event),
      headers: {
        "content-type": "application/json",
        "event-type": event.eventType,
        "source-zone": result.zone,
        "data-source": result.source,
      },
    };

    await this.producer.send({
      topic: this.topic,
      compression: CompressionTypes.None, // LZ4 handled at broker level
      messages: [message],
    });

    console.info(
      `[Kafka] Published event ${event.eventId} → ${this.topic} ` +
        `(zone=${result.zone}, intensity=${result.intensity} gCO₂/kWh, mode=${result.mode})`
    );
  }

  /**
   * Gracefully disconnect the producer.
   */
  async disconnect(): Promise<void> {
    if (this.producer && this.connected) {
      await this.producer.disconnect();
      this.connected = false;
      console.info("[Kafka] Producer disconnected");
    }
  }
}
