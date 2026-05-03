SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;


-- --------------------------------------------------------

--
-- 表的结构 `api_request_logs`
--

CREATE TABLE `api_request_logs` (
  `id` int(11) NOT NULL,
  `endpoint` varchar(50) NOT NULL COMMENT 'API端点',
  `method` varchar(10) NOT NULL COMMENT '请求方法',
  `ip_address` varchar(45) NOT NULL COMMENT 'IP地址',
  `user_agent` text COMMENT '用户代理',
  `request_data` text COMMENT '请求数据',
  `response_data` text COMMENT '响应数据',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '请求时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='API请求日志表';

-- --------------------------------------------------------

--
-- 表的结构 `authorization_codes`
--

CREATE TABLE `authorization_codes` (
  `id` int(11) NOT NULL,
  `code` varchar(255) NOT NULL COMMENT '加密存储的授权码',
  `plain_code` varchar(50) NOT NULL COMMENT '明文授权码（用于验证）',
  `member_days` int(11) NOT NULL COMMENT '会员天数',
  `is_used` tinyint(4) DEFAULT '0' COMMENT '0: 未使用, 1: 已使用',
  `username` varchar(50) DEFAULT NULL COMMENT '使用该授权码的用户名',
  `used_at` timestamp NULL DEFAULT NULL COMMENT '使用时间',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `email_send_logs`
--

CREATE TABLE `email_send_logs` (
  `id` int(11) NOT NULL,
  `email` varchar(255) NOT NULL COMMENT '收件邮箱',
  `subject` varchar(255) DEFAULT '邮箱验证码' COMMENT '邮件主题',
  `status` enum('success','failed') NOT NULL COMMENT '发送状态',
  `error_message` text COMMENT '错误信息',
  `sent_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '发送时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='邮件发送日志表';

-- --------------------------------------------------------

--
-- 表的结构 `email_verification_attempts`
--

CREATE TABLE `email_verification_attempts` (
  `id` int(11) NOT NULL,
  `code_id` int(11) NOT NULL COMMENT '验证码ID',
  `success` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否成功: 0-失败, 1-成功',
  `ip_address` varchar(45) DEFAULT NULL COMMENT 'IP地址',
  `user_agent` text COMMENT '用户代理',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='验证码尝试记录表';

-- --------------------------------------------------------

--
-- 表的结构 `email_verification_codes`
--

CREATE TABLE `email_verification_codes` (
  `id` int(11) NOT NULL,
  `email` varchar(255) NOT NULL COMMENT '邮箱地址',
  `code` varchar(10) NOT NULL COMMENT '验证码',
  `status` tinyint(1) NOT NULL DEFAULT '0' COMMENT '状态: 0-未验证, 1-已验证',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `expires_at` timestamp NOT NULL COMMENT '过期时间',
  `verified_at` timestamp NULL DEFAULT NULL COMMENT '验证时间',
  `ip_address` varchar(45) DEFAULT NULL COMMENT '请求IP',
  `user_agent` text COMMENT '用户代理'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='邮箱验证码表';

-- --------------------------------------------------------

--
-- 表的结构 `file_content`
--

CREATE TABLE `file_content` (
  `id` int(11) NOT NULL,
  `history_id` int(11) NOT NULL,
  `content_type` enum('full','diff') NOT NULL DEFAULT 'full',
  `content_data` mediumtext NOT NULL,
  `base_version_id` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `file_history`
--

CREATE TABLE `file_history` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `filename` varchar(255) NOT NULL,
  `version_id` int(11) NOT NULL,
  `content_hash` varchar(64) NOT NULL,
  `content_length` int(11) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `modified_by` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `file_shares`
--

CREATE TABLE `file_shares` (
  `id` int(11) NOT NULL,
  `share_id` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '分享唯一ID',
  `username` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '文档所有者',
  `filename` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '文件名',
  `mode` enum('view','edit') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'view' COMMENT '分享模式: view-仅查看, edit-可编辑',
  `password` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '访问密码（可选）',
  `edit_policy` enum('all','specific','password') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'all' COMMENT '编辑策略: all-所有查看者可编辑, specific-仅特定用户, password-输入编辑密码',
  `edit_password_hash` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '编辑密码哈希（当edit_policy=password时使用）',
  `expires_at` datetime DEFAULT NULL COMMENT '过期时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文档分享表';

-- --------------------------------------------------------

--
-- 表的结构 `member_records`
--

CREATE TABLE `member_records` (
  `id` int(11) NOT NULL,
  `username` varchar(50) NOT NULL COMMENT '用户名',
  `type` varchar(20) NOT NULL COMMENT '开通类型: auth_code, invite',
  `source` varchar(50) NOT NULL COMMENT '开通来源: 授权码或邀请码',
  `added_days` int(11) NOT NULL COMMENT '添加的会员天数',
  `start_date` date NOT NULL COMMENT '开始时间',
  `end_date` date NOT NULL COMMENT '结束时间',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `share_editors`
--

CREATE TABLE `share_editors` (
  `id` int(11) NOT NULL,
  `share_id` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '分享ID',
  `editor_username` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '允许编辑的用户名',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='分享文档指定可编辑用户表';

-- --------------------------------------------------------

--
-- 表的结构 `share_live_sessions`
--

CREATE TABLE `share_live_sessions` (
  `id` int(11) NOT NULL,
  `share_id` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '分享ID',
  `viewer_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '访客会话ID',
  `viewer_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '访客显示名',
  `is_editing` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否正在编辑',
  `can_edit` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否有编辑权限',
  `last_seen` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='分享文档在线会话状态';

-- --------------------------------------------------------

--
-- 表的结构 `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `username` varchar(50) NOT NULL,
  `password` varchar(255) NOT NULL,
  `inviter` varchar(50) DEFAULT NULL COMMENT '邀请人用户名',
  `is_member` tinyint(4) DEFAULT '0' COMMENT '0: 非会员, 1: 会员',
  `expire_date` date DEFAULT NULL COMMENT '会员到期时间',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `last_login` timestamp NULL DEFAULT NULL,
  `login_count` int(11) DEFAULT '0',
  `avatar` varchar(255) DEFAULT NULL COMMENT '用户头像路径',
  `e2e_enabled` tinyint(4) DEFAULT '0' COMMENT '0: 未开启端到端加密, 1: 已开启端到端加密'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `user_files`
--

CREATE TABLE `user_files` (
  `id` int(11) NOT NULL,
  `username` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `filename` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` longtext COLLATE utf8mb4_unicode_ci,
  `content_version` int(11) NOT NULL DEFAULT '1' COMMENT '内容版本号，用于并发冲突检测',
  `last_modified` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- 转储表的索引
--

--
-- 表的索引 `api_request_logs`
--
ALTER TABLE `api_request_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_endpoint` (`endpoint`),
  ADD KEY `idx_created_at` (`created_at`),
  ADD KEY `idx_ip` (`ip_address`);

--
-- 表的索引 `authorization_codes`
--
ALTER TABLE `authorization_codes`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `code` (`code`),
  ADD UNIQUE KEY `plain_code` (`plain_code`),
  ADD KEY `idx_plain_code` (`plain_code`),
  ADD KEY `idx_is_used` (`is_used`);

--
-- 表的索引 `email_send_logs`
--
ALTER TABLE `email_send_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_email` (`email`),
  ADD KEY `idx_sent_at` (`sent_at`),
  ADD KEY `idx_status` (`status`);

--
-- 表的索引 `email_verification_attempts`
--
ALTER TABLE `email_verification_attempts`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_code_id` (`code_id`),
  ADD KEY `idx_created_at` (`created_at`);

--
-- 表的索引 `email_verification_codes`
--
ALTER TABLE `email_verification_codes`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_email` (`email`),
  ADD KEY `idx_created_at` (`created_at`),
  ADD KEY `idx_expires_at` (`expires_at`),
  ADD KEY `idx_status` (`status`);

--
-- 表的索引 `file_content`
--
ALTER TABLE `file_content`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_history` (`history_id`);

--
-- 表的索引 `file_history`
--
ALTER TABLE `file_history`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_version` (`user_id`,`filename`,`version_id`),
  ADD KEY `idx_user_file` (`user_id`,`filename`);

--
-- 表的索引 `file_shares`
--
ALTER TABLE `file_shares`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `share_id` (`share_id`),
  ADD UNIQUE KEY `username_filename_share` (`username`,`filename`),
  ADD KEY `expires_at` (`expires_at`),
  ADD KEY `idx_share_id` (`share_id`);

--
-- 表的索引 `member_records`
--
ALTER TABLE `member_records`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_username` (`username`),
  ADD KEY `idx_type` (`type`);

--
-- 表的索引 `share_editors`
--
ALTER TABLE `share_editors`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_share_editor` (`share_id`,`editor_username`),
  ADD KEY `idx_editor_username` (`editor_username`);

--
-- 表的索引 `share_live_sessions`
--
ALTER TABLE `share_live_sessions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_share_viewer` (`share_id`,`viewer_id`),
  ADD KEY `idx_share_last_seen` (`share_id`,`last_seen`);

--
-- 表的索引 `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `username` (`username`);

--
-- 表的索引 `user_files`
--
ALTER TABLE `user_files`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `username_filename` (`username`,`filename`),
  ADD KEY `idx_username` (`username`),
  ADD KEY `idx_last_modified` (`last_modified`);

--
-- 在导出的表使用AUTO_INCREMENT
--

--
-- 使用表AUTO_INCREMENT `api_request_logs`
--
ALTER TABLE `api_request_logs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- 使用表AUTO_INCREMENT `authorization_codes`
--
ALTER TABLE `authorization_codes`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- 使用表AUTO_INCREMENT `email_send_logs`
--
ALTER TABLE `email_send_logs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- 使用表AUTO_INCREMENT `email_verification_attempts`
--
ALTER TABLE `email_verification_attempts`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- 使用表AUTO_INCREMENT `email_verification_codes`
--
ALTER TABLE `email_verification_codes`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- 使用表AUTO_INCREMENT `file_content`
--
ALTER TABLE `file_content`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- 使用表AUTO_INCREMENT `file_history`
--
ALTER TABLE `file_history`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- 使用表AUTO_INCREMENT `file_shares`
--
ALTER TABLE `file_shares`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- 使用表AUTO_INCREMENT `member_records`
--
ALTER TABLE `member_records`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- 使用表AUTO_INCREMENT `share_editors`
--
ALTER TABLE `share_editors`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- 使用表AUTO_INCREMENT `share_live_sessions`
--
ALTER TABLE `share_live_sessions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- 使用表AUTO_INCREMENT `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- 使用表AUTO_INCREMENT `user_files`
--
ALTER TABLE `user_files`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- 限制导出的表
--

--
-- 限制表 `file_content`
--
ALTER TABLE `file_content`
  ADD CONSTRAINT `fk_content_history` FOREIGN KEY (`history_id`) REFERENCES `file_history` (`id`) ON DELETE CASCADE;

--
-- 限制表 `file_history`
--
ALTER TABLE `file_history`
  ADD CONSTRAINT `fk_history_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- 限制表 `file_shares`
--
ALTER TABLE `file_shares`
  ADD CONSTRAINT `fk_file_shares_user_files` FOREIGN KEY (`username`,`filename`) REFERENCES `user_files` (`username`, `filename`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- 限制表 `share_editors`
--
ALTER TABLE `share_editors`
  ADD CONSTRAINT `fk_share_editors_share` FOREIGN KEY (`share_id`) REFERENCES `file_shares` (`share_id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- 限制表 `share_live_sessions`
--
ALTER TABLE `share_live_sessions`
  ADD CONSTRAINT `fk_share_live_sessions_share` FOREIGN KEY (`share_id`) REFERENCES `file_shares` (`share_id`) ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;