import mongoose from 'mongoose';
import dotenv from 'dotenv/config';
const dbName =process.env.MONGO_DB_NAME 
mongoose.connect(process.env.MONGO_URI,{dbName}).then(() => {
  console.log('Database Connected');
}).catch((err) => {
  console.log(err);
})

export default mongoose.connection;
