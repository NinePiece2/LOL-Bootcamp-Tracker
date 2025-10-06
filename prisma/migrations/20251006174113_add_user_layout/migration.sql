-- CreateTable
CREATE TABLE "user_layouts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "layout" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_layouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_layouts_user_id_key" ON "user_layouts"("user_id");

-- AddForeignKey
ALTER TABLE "user_layouts" ADD CONSTRAINT "user_layouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
