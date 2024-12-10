import multer from 'multer';

const storage = multer.diskStorage({
    destination: function(req, file, cb){
        cb(null, '/Users/parth/Desktop/Coding/Backend/Backend Project/public/temp/');
    },
    filename: function(req, file, cb){
        cb(null, file.originalname);
    }
})
export const upload = multer({
    storage,
})