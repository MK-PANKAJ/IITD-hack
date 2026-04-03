require("dotenv").config();
const { Pool } = require("pg");
const neo4j = require("neo4j-driver");
const { Kafka } = require("kafkajs");
const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");

const pg = new Pool({ connectionString: process.env.POSTGRES_URI });

const neo = neo4j.driver(
  process.env.NEO4J_URI || "bolt://localhost:7687",
  neo4j.auth.basic(process.env.NEO4J_USER || "neo4j", process.env.NEO4J_PASSWORD || "cg-graph-s3cur3-2026!")
);

const kafka = new Kafka({
  clientId: 'cloudgreen-os',
  brokers: String(process.env.KAFKA_BROKERS || 'localhost:9092').split(',')
});
const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'cloudgreen-backend-group' });

const client = jwksClient({
  jwksUri: process.env.KEYCLOAK_JWKS_URL || 'http://localhost:8180/realms/cloudgreen/protocol/openid-connect/certs'
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, function(err, key) {
    if (err) return callback(err);
    var signingKey = key?.publicKey || key?.rsaPublicKey;
    callback(null, signingKey);
  });
}

function verifyKeycloakToken(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(token, getKey, { algorithms: ['RS256'] }, (err, decoded) => {
      if (err) return reject(err);
      resolve(decoded);
    });
  });
}

async function initServices() {
  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topic: 'carbon-events', fromBeginning: true });
  
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const payload = JSON.parse(message.value.toString());
        // Simple materialized view sync. If we see a carbon-event, log it to telemetry
        await pg.query(
          "INSERT INTO analytics_events(id, event, distinct_id, properties, ts) VALUES($1, $2, $3, $4, $5)",
          [`evt-kaf-${Date.now()}`, "carbon-events-stream", "backend-system", JSON.stringify(payload), new Date().toISOString()]
        );
      } catch (err) {
        console.error("Kafka consumer processing error:", err);
      }
    },
  });
  console.log("Strimzi Kafka services initialized and consuming from 'carbon-events'");
}

module.exports = { pg, neo, producer, consumer, verifyKeycloakToken, initServices };
