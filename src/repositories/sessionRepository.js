const Session = require("../models/Session");

class SessionRepository {
  async getOrCreate(from) {
    try {
      let session = await Session.findOne({ from });
      if (!session) {
        session = await Session.create({ from, userId: from });
      }
      return session;
    } catch (error) {
      console.error("Error in sessionRepo.getOrCreate:", error);
      throw error;
    }
  }

  async updateSession(from, updates) {
    try {
      return await Session.findOneAndUpdate(
        { from },
        { $set: updates },
        { new: true }
      );
    } catch (error) {
      console.error("Error in sessionRepo.updateSession:", error);
      throw error;
    }
  }
}

module.exports = new SessionRepository();
