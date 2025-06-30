// 📁 models/User.js
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  isPro: { type: Boolean, default: false }
});

const User = mongoose.model('User', userSchema);
export default User;

