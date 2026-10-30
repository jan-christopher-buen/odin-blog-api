-- CreateEnum
CREATE TYPE "Role" AS ENUM ('AUTHOR', 'READER');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "username" VARCHAR(40) NOT NULL,
    "displayName" VARCHAR(80) NOT NULL,
    "passwordHash" VARCHAR(100) NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'READER',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "excerpt" VARCHAR(400),
    "body" TEXT NOT NULL,
    "status" "PostStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "displayName" VARCHAR(80) NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "Post_status_publishedAt_id_idx" ON "Post"("status", "publishedAt", "id");

-- CreateIndex
CREATE INDEX "Post_authorId_updatedAt_id_idx" ON "Post"("authorId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "Comment_postId_createdAt_id_idx" ON "Comment"("postId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep core text and publication invariants even for writes outside the API.
ALTER TABLE "User" ADD CONSTRAINT "User_username_format" CHECK (username ~ '^[a-z0-9_-]{3,40}$');
ALTER TABLE "User" ADD CONSTRAINT "User_display_name_nonempty" CHECK (length(trim("displayName")) BETWEEN 1 AND 80);
ALTER TABLE "Post" ADD CONSTRAINT "Post_title_nonempty" CHECK (length(trim(title)) BETWEEN 1 AND 200);
ALTER TABLE "Post" ADD CONSTRAINT "Post_body_length" CHECK (length(trim(body)) BETWEEN 1 AND 50000);
ALTER TABLE "Post" ADD CONSTRAINT "Post_publication_state" CHECK ((status = 'PUBLISHED' AND "publishedAt" IS NOT NULL) OR (status = 'DRAFT' AND "publishedAt" IS NULL));
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_name_nonempty" CHECK (length(trim("displayName")) BETWEEN 1 AND 80);
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_body_nonempty" CHECK (length(trim(body)) BETWEEN 1 AND 2000);
