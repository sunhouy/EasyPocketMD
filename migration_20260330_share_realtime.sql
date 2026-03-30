-- Migration: share password/edit policy + realtime collaboration support
-- NOTE: This variant avoids querying information_schema (for restricted DB accounts).
-- If a statement says duplicate/exists, skip that statement and continue.

-- 1) user_files: optimistic concurrency version column
ALTER TABLE user_files
  ADD COLUMN content_version INT NOT NULL DEFAULT 1 COMMENT '内容版本号，用于并发冲突检测' AFTER content;

UPDATE user_files
SET content_version = 1
WHERE content_version IS NULL OR content_version < 1;

-- 2) file_shares: edit policy + edit password hash
ALTER TABLE file_shares
  ADD COLUMN edit_policy ENUM('all','specific','password') NOT NULL DEFAULT 'all' COMMENT '编辑策略: all-所有查看者可编辑, specific-仅特定用户, password-输入编辑密码' AFTER password;

ALTER TABLE file_shares
  ADD COLUMN edit_password_hash VARCHAR(255) DEFAULT NULL COMMENT '编辑密码哈希（当edit_policy=password时使用）' AFTER edit_policy;

-- 3) share_editors table
CREATE TABLE IF NOT EXISTS share_editors (
  id INT(11) NOT NULL AUTO_INCREMENT,
  share_id VARCHAR(32) NOT NULL COMMENT '分享ID',
  editor_username VARCHAR(255) NOT NULL COMMENT '允许编辑的用户名',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_share_editor (share_id, editor_username),
  KEY idx_editor_username (editor_username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='分享文档指定可编辑用户表';

-- 4) share_live_sessions table
CREATE TABLE IF NOT EXISTS share_live_sessions (
  id INT(11) NOT NULL AUTO_INCREMENT,
  share_id VARCHAR(32) NOT NULL COMMENT '分享ID',
  viewer_id VARCHAR(64) NOT NULL COMMENT '访客会话ID',
  viewer_name VARCHAR(255) NOT NULL COMMENT '访客显示名',
  is_editing TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否正在编辑',
  can_edit TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否有编辑权限',
  last_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_share_viewer (share_id, viewer_id),
  KEY idx_share_last_seen (share_id, last_seen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='分享文档在线会话状态';

-- 5) Foreign keys
-- Run these once. If duplicate constraint error occurs, skip and continue.
ALTER TABLE share_editors
  ADD CONSTRAINT fk_share_editors_share
  FOREIGN KEY (share_id) REFERENCES file_shares (share_id)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE share_live_sessions
  ADD CONSTRAINT fk_share_live_sessions_share
  FOREIGN KEY (share_id) REFERENCES file_shares (share_id)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Optional FK to users table (enable only when username collation/length is compatible)
-- ALTER TABLE share_editors
--   ADD CONSTRAINT fk_share_editors_user
--   FOREIGN KEY (editor_username) REFERENCES users (username)
--   ON DELETE CASCADE ON UPDATE CASCADE;

