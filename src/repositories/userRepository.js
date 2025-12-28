const User = require("../models/User");

class UserRepository {
  async getUserByPhone(phoneNumber) {
    try {
      return await User.findOne({ phoneNumber });
    } catch (error) {
      console.error("Error in userRepo.getUserByPhone:", error);
      throw error;
    }
  }

  async createUser(userData) {
    try {
      return await User.create(userData);
    } catch (error) {
      console.error("Error in userRepo.createUser:", error);
      throw error;
    }
  }
}

module.exports = new UserRepository();
