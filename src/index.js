import dotenv from 'dotenv';
import connectDB from "./db/connection.js";

import app from './app.js';

dotenv.config({
    path: "../env"
})

connectDB()
.then(() => {
    const alternatePort = 8000
    app.listen(process.env.PORT || alternatePort, () => {
        console.log(`App listening on port: ${process.env.PORT || alternatePort}`)
    });
    app.on('error', (error) => {
        console.error("Error: ", error);
        throw error
    })
})
.catch((e) => {
    console.log("Database connection failed!! ", e)
})