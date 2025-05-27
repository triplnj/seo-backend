import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import router from './routes/generateBrief.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT;

app.use(cors());
app.use(express.json());
app.use('/api/brief', router);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
