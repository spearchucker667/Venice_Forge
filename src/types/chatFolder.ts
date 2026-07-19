export interface ChatFolder {
  id: string;
  name: string;
  sortOrder: number;

  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;

  lockState: "unlocked" | "locked";
  lockedAt?: string | null;
  lockVersion?: number;

  schemaVersion: number;
}

export const CHAT_FOLDER_NAME_MAX_LENGTH = 80;
