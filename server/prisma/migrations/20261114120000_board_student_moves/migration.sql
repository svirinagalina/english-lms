-- A student's own layout on a group board: where they moved the teacher's
-- things, seen only by them. { studentId: { elementId: [dx, dy] } }
ALTER TABLE "Board" ADD COLUMN "studentMoves" JSONB NOT NULL DEFAULT '{}';
