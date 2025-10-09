// Simple test to verify MongoDB integration
require('dotenv').config();
const connectDB = require('../src/config/database');
const sessionRepo = require('../src/repositories/sessionRepository');
const userRepo = require('../src/repositories/userRepository');

async function testMongoDB() {
  try {
    console.log('Testing MongoDB integration...');
    
    // Connect to MongoDB
    await connectDB();
    
    // Test session creation
    console.log('Testing session repository...');
    const session = await sessionRepo.getOrCreate('+1234567890');
    console.log('Session created:', session);
    
    // Test user creation
    console.log('Testing user repository...');
    try {
      const user = await userRepo.createUser('+1234567890', { testData: true });
      console.log('User created:', user);
    } catch (error) {
      if (error.message === 'User already exists') {
        console.log('User already exists (expected)');
        const existingUser = await userRepo.getUserByPhone('+1234567890');
        console.log('Retrieved existing user:', existingUser);
      } else {
        throw error;
      }
    }
    
    // Test session stats
    const stats = await sessionRepo.getSessionStats();
    console.log('Session stats:', stats);
    
    console.log('✅ MongoDB integration test completed successfully');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ MongoDB integration test failed:', error);
    process.exit(1);
  }
}

testMongoDB();