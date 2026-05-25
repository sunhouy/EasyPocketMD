ALTER TABLE `user_files`
  ADD COLUMN `e2e_enabled` tinyint(4) DEFAULT '0' COMMENT '0: 此文件未开启端到端加密, 1: 此文件已开启端到端加密' AFTER `content_version`;

UPDATE `user_files` uf
JOIN `users` u ON u.`username` = uf.`username`
SET uf.`e2e_enabled` = IFNULL(u.`e2e_enabled`, 0);
