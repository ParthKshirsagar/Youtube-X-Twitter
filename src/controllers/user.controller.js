import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { User } from '../models/user.model.js';
import jwt from 'jsonwebtoken';

import { deleteFromCloudinary, uploadToCloudinary } from '../utils/cloudinary.js';
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
};

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
});

const refreshAccessToken = asyncHandler(async(req, res) => {
    try {
        const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;
        if(!incomingRefreshToken) {
            throw new ApiError(401, "Unauthorized request");
        }
    
        const userId = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)?._id;
    
        const user = await User.findById(userId);
        if(!user){
            throw new ApiError(401, "Invalid refresh token");
        }
    
        if(incomingRefreshToken !== user?.refreshToken){
            throw new ApiError(401, "Refresh token is expired or used");
        }
    
        const options = {
            httpOnly: true,
            secure: true
        };
    
        const {accessToken, refreshToken} = await generateAccessAndRefreshTokens(user._id);
    
        return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("accessToken", refreshToken, options)
        .json(
            new ApiResponse(
                200,
                {
                    accessToken,
                    refreshToken
                },
                "Access token refreshed"
            )
        )
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refreshToken");
    }
});

const changePassword = asyncHandler(async(req, res) => {
    console.log("hello");
    const {oldPassword, newPassword} = req.body;
    
    const user = await User.findById(req.user?._id);
    if(!user){
        throw new ApiError(401, "Unauthorized request");
    }
    
    const isOldPasswordCorrect = await user.isPasswordCorrect(oldPassword);
    if(!isOldPasswordCorrect){
        throw new ApiError(400, "Incorrect old password");
    }

    user.password = newPassword;
    user.save({ validateBeforeSave: false });

    return res
    .status(200)
    .json(
        new ApiResponse(
            200,
            {},
            "Password changed successfully"
        )
    )
});

const getCurrentUser = asyncHandler(async(req, res) => {
    return res
    .status(200)
    .json(
        new ApiResponse(
            200,
            { user: req.user },
            "Current user fetched"
        )
    )
});

const updateAccountDetails = asyncHandler(async(req, res) => {
    const {fullName, email} = req.body;

    if(!fullName && !email){
        throw new ApiError(400, "At least one field needs to be given to change");
    }

    const currentUser = req.user;
    
    currentUser.fullName = fullName ? fullName : currentUser.fullName;
    currentUser.email = email ? email : currentUser.email;
    await currentUser.save({ validateBeforeSave: false });

    return res
    .status(200)
    .json(
        new ApiResponse(
            200,
            { updatedUser: currentUser },
            "User updated successfully"
        )
    )
});

const updateUserImages = asyncHandler(async(req, res) => {
    const user = req.user;

    if(!user){
        throw new ApiError(401, "Unauthorized request");
    }

    let avatarLocalPath;
    let coverImageLocalPath;
    if(req.files?.avatar){
        avatarLocalPath = req.files.avatar[0]?.path;
    }
    if(req.files?.coverImage){
        coverImageLocalPath = req.files.coverImage[0]?.path;
    }

    if(!avatarLocalPath && !coverImageLocalPath){
        throw new ApiError(400, "Atlest one image needs to be given to be updated")
    }
    
    const currentAvatarFileUrl = user.avatar;
    const currentCoverImageFileUrl = user.coverImage;
    
    // getting stored file names from url saved in db for deletion of previous files once new files are added
    const currentAvatarFilePublicID = currentAvatarFileUrl.split("/").slice(-1)[0].split(".")[0];
    const currentCoverImageFilePublicID = currentCoverImageFileUrl.split("/").slice(-1)[0].split(".")[0];

    const avatar = avatarLocalPath ? await uploadToCloudinary(avatarLocalPath) : null;
    const coverImage = coverImageLocalPath ? await uploadToCloudinary(coverImageLocalPath) : null;

    if(avatar && coverImage){
        const response = await deleteFromCloudinary([currentAvatarFilePublicID, currentCoverImageFilePublicID]);
        if(!response){
            throw new ApiError(500, "Error while deleting previous files from cloudinary");
        }
    }
    if(avatar && !coverImage){
        const response = await deleteFromCloudinary([currentAvatarFilePublicID]);
        if(!response){
            throw new ApiError(500, "Error while deleting previous avatar file from cloudinary");
        }
    }
    if(!avatar && coverImage){
        const response = await deleteFromCloudinary([currentcoverImageFilePublicID]);
        if(!response){
            throw new ApiError(500, "Error while deleting previous Cover Image file from cloudinary");
        }
    }

    const updatedUser = await User.findByIdAndUpdate(user._id, {
        $set: {
            avatar: avatar?.url || currentAvatarFileUrl,
            coverImage: coverImage?.url ||currentCoverImageFileUrl
        }
    }).select("-password -refreshToken");

    return res
    .status(200)
    .json(
        new ApiResponse(
            200,
            { user: updatedUser },
            "User files updated successfully"
        )
    );
});


export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changePassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserImages
}