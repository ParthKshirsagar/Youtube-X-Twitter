import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { User } from '../models/user.model.js';

import { uploadToCloudinary } from '../utils/cloudinary.js';
import { ApiResponse } from '../utils/ApiResponse.js';

const generateAccessAndRefreshTokens = async (userId) => {
    try {
        const user = await User.findById(userId);
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });

        return {accessToken, refreshToken};
    } catch (error) {
        throw new ApiError(500, "Error while generating access and refresh tokens")
    }
}

const registerUser = asyncHandler(async (req, res) => {
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

const loginUser = asyncHandler(async(req, res) => {
    const {usernameOrEmail, password} = req.body;

    if(!usernameOrEmail || !password){
        throw new ApiError(400, "All the fields are required")
    }

    const user = await User.findOne({
        $or: [
            { username: usernameOrEmail },
            { email: usernameOrEmail }
        ]
    });

    if(!user){
        throw new ApiError(404, "User does not exist");
    };

    const isPasswordValid = await user.isPasswordCorrect(password);

    if(!isPasswordValid){
        throw new ApiError(401, "Incorrect password");
    }

    const {accessToken, refreshToken} = await generateAccessAndRefreshTokens(user._id);

    const loggedInUser = await User.findById(user._id).select('-password -refreshToken');

    const options = {
        httpOnly: true,
        secure: true
    };

    return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
        new ApiResponse(
            200,
            {
                user: loggedInUser,
                accessToken,
                refreshToken
            },
            "User logged in successfully"
        )
    )
});

const logoutUser = asyncHandler(async(req, res) => {
    await User.findByIdAndUpdate(
        req.user?._id, 
        {
            $set: {
                refreshToken: undefined
            }
        }, 
    )

    const options = {
        httpOnly: true,
        secure: true
    };

    return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(
        new ApiResponse(
            200,
            {},
            "User logged out successfully"
        )
    )
})

export {
    registerUser,
    loginUser,
    logoutUser
}