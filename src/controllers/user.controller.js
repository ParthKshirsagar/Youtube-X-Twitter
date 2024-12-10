import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { User } from '../models/user.model.js';

import { uploadToCloudinary } from '../utils/cloudinary.js';
import { ApiResponse } from '../utils/ApiResponse.js'

const registerUser = asyncHandler( async (req, res) => {
    const {username, email, password, fullName} = req.body;

    if(
        [username, email, password, fullName].some((field) => field?.trim() == "")
    ){
        throw new ApiError(400, "All the fields are required");
    }

    const existingUser = await User.findOne({ username });

    if(existingUser){
        throw new ApiError(409, "User with given username already exists");
    }
    
    let avatarLocalPath;
    let coverImageLocalPath;
    if(req.files?.avatar) {
        avatarLocalPath = req.files?.avatar[0]?.path;
    }
    if(req.files?.coverImage){
        coverImageLocalPath = req.files?.coverImage[0]?.path;
    }
    
    const avatar = avatarLocalPath ? await uploadToCloudinary(avatarLocalPath) : null;
    const coverImage = coverImageLocalPath ? await uploadToCloudinary(coverImageLocalPath) : null;

    const user = await User.create({
        fullName,
        avatar: avatar?.url || "",
        username: username.toLowerCase(),
        password,
        coverImage: coverImage?.url || "",
        email,
    });

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    );

    if(!createdUser){
        throw new ApiError(500, "Something went wrong while signing up the user.");
    };

    return res.status(201).json(new ApiResponse(200, createdUser, "User created successfully!"));
});

export { registerUser }