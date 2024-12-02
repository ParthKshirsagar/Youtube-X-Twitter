import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";

const connectDB = async () => {
    try {
        const connectionInstance = await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`)
        console.log(`Connected to Database successfully. DB HOST: ${connectionInstance.connection.host}`);
    } catch (error) {
        console.error("Error occured while connecting to database: ", error);
        process.exit()
    }
}

export default connectDB;