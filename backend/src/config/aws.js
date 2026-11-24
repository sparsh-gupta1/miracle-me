const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, HeadObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const s3Client = new S3Client({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  region: process.env.AWS_REGION,
});

const s3Config = {
  bucket: process.env.AWS_S3_BUCKET,
  region: process.env.AWS_REGION,
  maxFileSize: 10 * 1024 * 1024,
};

const generatePresignedUrl = async (key, expiresIn = 3600) => {
  try {
    const command = new PutObjectCommand({
      Bucket: s3Config.bucket,
      Key: key,
      ContentType: "application/octet-stream",
    });
    return await getSignedUrl(s3Client, command, { expiresIn });
  } catch (error) {
    throw new Error(`Failed to generate presigned URL: ${error.message}`);
  }
};

const generateDownloadUrl = async (key, expiresIn = 3600) => {
  try {
    const command = new GetObjectCommand({ Bucket: s3Config.bucket, Key: key });
    return await getSignedUrl(s3Client, command, { expiresIn });
  } catch (error) {
    throw new Error(`Failed to generate download URL: ${error.message}`);
  }
};

const uploadFile = async (fileBuffer, key, contentType = "application/octet-stream") => {
  try {
    const command = new PutObjectCommand({
      Bucket: s3Config.bucket,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
    });
    const result = await s3Client.send(command);
    const url = `https://${s3Config.bucket}.s3.${s3Config.region}.amazonaws.com/${key}`;
    return { success: true, key, url, etag: result.ETag };
  } catch (error) {
    throw new Error(`Failed to upload file to S3: ${error.message}`);
  }
};

const deleteFile = async (key) => {
  try {
    await s3Client.send(new DeleteObjectCommand({ Bucket: s3Config.bucket, Key: key }));
    return { success: true, message: `File ${key} deleted successfully` };
  } catch (error) {
    throw new Error(`Failed to delete file from S3: ${error.message}`);
  }
};

const listFiles = async (prefix = "") => {
  try {
    const result = await s3Client.send(new ListObjectsV2Command({ Bucket: s3Config.bucket, Prefix: prefix }));
    return result.Contents || [];
  } catch (error) {
    throw new Error(`Failed to list files: ${error.message}`);
  }
};

const getObject = async (key) => {
  const result = await s3Client.send(new GetObjectCommand({ Bucket: s3Config.bucket, Key: key }));
  return result;
};

const headObject = async (key) => {
  return await s3Client.send(new HeadObjectCommand({ Bucket: s3Config.bucket, Key: key }));
};

module.exports = {
  s3Client,
  s3Config,
  generatePresignedUrl,
  generateDownloadUrl,
  uploadFile,
  deleteFile,
  listFiles,
  getObject,
  headObject,
};
