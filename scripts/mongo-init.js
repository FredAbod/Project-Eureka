// MongoDB initialization script
db = db.getSiblingDB('whatsappai');

// Create collections with validation
db.createCollection('sessions', {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["sessionId", "userId", "phoneNumber"],
      properties: {
        sessionId: { bsonType: "string" },
        userId: { bsonType: "string" },
        phoneNumber: { bsonType: "string" },
        authState: { 
          bsonType: "string",
          enum: ["pending", "authenticated", "expired"]
        },
        lastActivity: { bsonType: "date" },
        metadata: { bsonType: "object" }
      }
    }
  }
});

db.createCollection('users', {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["userId", "phoneNumber"],
      properties: {
        userId: { bsonType: "string" },
        phoneNumber: { bsonType: "string" },
        accountData: { bsonType: "object" },
        preferences: { bsonType: "object" },
        isActive: { bsonType: "bool" },
        lastLogin: { bsonType: "date" }
      }
    }
  }
});

// Create indexes for better performance
db.sessions.createIndex({ "phoneNumber": 1 }, { unique: true });
db.sessions.createIndex({ "sessionId": 1 }, { unique: true });
db.sessions.createIndex({ "lastActivity": 1 }, { expireAfterSeconds: 3600 });

db.users.createIndex({ "phoneNumber": 1 }, { unique: true });
db.users.createIndex({ "userId": 1 }, { unique: true });

print("Database initialization completed successfully");