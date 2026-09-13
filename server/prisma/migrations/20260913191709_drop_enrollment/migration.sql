-- DropForeignKey
ALTER TABLE "Enrollment" DROP CONSTRAINT "Enrollment_lessonId_fkey";

-- DropForeignKey
ALTER TABLE "Enrollment" DROP CONSTRAINT "Enrollment_studentId_fkey";

-- DropTable
DROP TABLE "Enrollment";

