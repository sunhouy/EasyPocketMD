<?php
/**
 * 文档分享管理类
 */
class ShareManager {
    private $db;
    private $config;

    public function __construct($db, $config) {
        $this->db = $db;
        $this->config = $config;
    }

    /**
     * 创建文档分享链接
     */
    /**
     * 创建文档分享链接
     */
    public function createShare($username, $password, $filename, $mode = 'view', $sharePassword = null, $expireDays = 7) {
        try {
            $conn = $this->db->getConnection();

            // 1. 验证用户身份（密码验证）
            $userSql = "SELECT id, password FROM users WHERE username = ?";
            $userStmt = $conn->prepare($userSql);
            $userStmt->bind_param("s", $username);
            $userStmt->execute();
            $userResult = $userStmt->get_result();
            $userStmt->close();

            if ($userResult->num_rows === 0) {
                return [
                    'code' => 401,
                    'message' => '用户认证失败'
                ];
            }

            $user = $userResult->fetch_assoc();

            // 验证密码
            if (!password_verify($password, $user['password'])) {
                return [
                    'code' => 401,
                    'message' => '用户认证失败'
                ];
            }

            // 2. 验证文档是否存在
            $checkSql = "SELECT id FROM user_files WHERE username = ? AND filename = ?";
            $checkStmt = $conn->prepare($checkSql);
            $checkStmt->bind_param("ss", $username, $filename);
            $checkStmt->execute();
            $checkResult = $checkStmt->get_result();
            $checkStmt->close();

            if ($checkResult->num_rows === 0) {
                return [
                    'code' => 404,
                    'message' => '文档不存在'
                ];
            }

            // 3. 计算过期时间
            $expiresAt = null;
            if ($expireDays > 0) {
                $expiresAt = date('Y-m-d H:i:s', strtotime("+{$expireDays} days"));
            }

            // 4. 检查是否已存在分享链接
            $checkShareSql = "SELECT share_id FROM file_shares WHERE username = ? AND filename = ?";
            $checkShareStmt = $conn->prepare($checkShareSql);
            $checkShareStmt->bind_param("ss", $username, $filename);
            $checkShareStmt->execute();
            $checkShareResult = $checkShareStmt->get_result();
            
            if ($checkShareResult->num_rows > 0) {
                // 已存在分享链接，更新它
                $existingShare = $checkShareResult->fetch_assoc();
                $shareId = $existingShare['share_id'];
                
                $updateSql = "UPDATE file_shares SET mode = ?, password = ?, expires_at = ? WHERE share_id = ?";
                $updateStmt = $conn->prepare($updateSql);
                $updateStmt->bind_param("ssss", $mode, $sharePassword, $expiresAt, $shareId);
                
                if (!$updateStmt->execute()) {
                    $error = $updateStmt->error;
                    $updateStmt->close();
                    $checkShareStmt->close();
                    throw new Exception("更新分享失败: " . $error);
                }
                
                $updateStmt->close();
                $checkShareStmt->close();
                
                $shareUrl = $this->getShareUrl($shareId);
                
                return [
                    'code' => 200,
                    'message' => '分享更新成功',
                    'data' => [
                        'share_id' => $shareId,
                        'share_url' => $shareUrl,
                        'mode' => $mode,
                        'expires_at' => $expiresAt,
                        'has_password' => !empty($sharePassword)
                    ]
                ];
            }
            
            $checkShareStmt->close();
            
            // 5. 插入新的分享记录 - 循环直到成功
            $maxAttempts = 10;
            $attempt = 0;
            
            while ($attempt < $maxAttempts) {
                $attempt++;
                
                // 生成唯一的分享ID
                $shareId = $this->generateShareId();

                // 插入分享记录
                $insertSql = "INSERT INTO file_shares (share_id, username, filename, mode, password, expires_at) 
                          VALUES (?, ?, ?, ?, ?, ?)";
                $insertStmt = $conn->prepare($insertSql);
                $insertStmt->bind_param("ssssss", $shareId, $username, $filename, $mode, $sharePassword, $expiresAt);

                if ($insertStmt->execute()) {
                    $shareUrl = $this->getShareUrl($shareId);
                    $insertStmt->close();

                    return [
                        'code' => 200,
                        'message' => '分享创建成功',
                        'data' => [
                            'share_id' => $shareId,
                            'share_url' => $shareUrl,
                            'mode' => $mode,
                            'expires_at' => $expiresAt,
                            'has_password' => !empty($sharePassword)
                        ]
                    ];
                }

                $error = $insertStmt->error;
                $insertStmt->close();

                // 检查错误类型
                if (strpos($error, 'Duplicate entry') === false) {
                    // 不是唯一键冲突，直接报错
                    throw new Exception("创建分享失败: " . $error);
                }

                // 如果是share_id的唯一键冲突，继续循环生成新的ID
            }

            throw new Exception("无法生成唯一的分享ID");
        } catch (Exception $e) {
            error_log("创建分享失败: " . $e->getMessage());
            return [
                'code' => 500,
                'message' => '创建分享失败: ' . $e->getMessage()
            ];
        }
    }

    /**
     * 获取分享的文档内容
     */
    public function getSharedFile($shareId, $password = null) {
        try {
            $conn = $this->db->getConnection();

            // 获取分享信息
            $shareSql = "SELECT s.*, f.content 
                        FROM file_shares s 
                        JOIN user_files f ON s.username = f.username AND s.filename = f.filename 
                        WHERE s.share_id = ? AND (s.expires_at IS NULL OR s.expires_at > NOW())";
            $shareStmt = $conn->prepare($shareSql);
            $shareStmt->bind_param("s", $shareId);
            $shareStmt->execute();
            $shareResult = $shareStmt->get_result();

            if ($shareResult->num_rows === 0) {
                $shareStmt->close();
                return [
                    'code' => 404,
                    'message' => '分享不存在或已过期'
                ];
            }

            $share = $shareResult->fetch_assoc();
            $shareStmt->close();

            // 验证密码
            if (!empty($share['password'])) {
                if (empty($password)) {
                    return [
                        'code' => 401,
                        'message' => '需要访问密码'
                    ];
                }

                if ($share['password'] !== $password) {
                    return [
                        'code' => 403,
                        'message' => '密码错误'
                    ];
                }
            }

            return [
                'code' => 200,
                'message' => '获取分享内容成功',
                'data' => [
                    'share_id' => $share['share_id'],
                    'username' => $share['username'],
                    'filename' => $share['filename'],
                    'content' => $share['content'],
                    'mode' => $share['mode'],
                    'created_at' => $share['created_at'],
                    'expires_at' => $share['expires_at'],
                    'is_expired' => $share['expires_at'] && strtotime($share['expires_at']) < time()
                ]
            ];

        } catch (Exception $e) {
            error_log("获取分享内容失败: " . $e->getMessage());
            return [
                'code' => 500,
                'message' => '获取分享内容失败: ' . $e->getMessage()
            ];
        }
    }

    /**
     * 更新分享的文档内容
     */
    public function updateSharedFile($shareId, $content, $password = null) {
        try {
            $conn = $this->db->getConnection();

            // 获取分享信息
            $shareSql = "SELECT * FROM file_shares 
                        WHERE share_id = ? AND (expires_at IS NULL OR expires_at > NOW())";
            $shareStmt = $conn->prepare($shareSql);
            $shareStmt->bind_param("s", $shareId);
            $shareStmt->execute();
            $shareResult = $shareStmt->get_result();

            if ($shareResult->num_rows === 0) {
                $shareStmt->close();
                return [
                    'code' => 404,
                    'message' => '分享不存在或已过期'
                ];
            }

            $share = $shareResult->fetch_assoc();
            $shareStmt->close();

            // 验证密码
            if (!empty($share['password'])) {
                if (empty($password)) {
                    return [
                        'code' => 401,
                        'message' => '需要访问密码'
                    ];
                }

                if ($share['password'] !== $password) {
                    return [
                        'code' => 403,
                        'message' => '密码错误'
                    ];
                }
            }

            // 验证分享模式
            if ($share['mode'] !== 'edit') {
                return [
                    'code' => 403,
                    'message' => '当前分享仅允许查看，不允许编辑'
                ];
            }

            // 更新原文档内容
            $updateSql = "UPDATE user_files SET content = ?, last_modified = NOW() 
                         WHERE username = ? AND filename = ?";
            $updateStmt = $conn->prepare($updateSql);
            $updateStmt->bind_param("sss", $content, $share['username'], $share['filename']);

            if (!$updateStmt->execute()) {
                $error = $updateStmt->error;
                $updateStmt->close();
                throw new Exception("更新文档失败: " . $error);
            }

            $updateStmt->close();

            return [
                'code' => 200,
                'message' => '文档更新成功',
                'data' => [
                    'share_id' => $share['share_id'],
                    'username' => $share['username'],
                    'filename' => $share['filename'],
                    'mode' => $share['mode']
                ]
            ];

        } catch (Exception $e) {
            error_log("更新分享文档失败: " . $e->getMessage());
            return [
                'code' => 500,
                'message' => '更新分享文档失败: ' . $e->getMessage()
            ];
        }
    }

    /**
     * 获取用户的分享列表
     */
    public function getUserShares($username) {
        try {
            $conn = $this->db->getConnection();

            $sql = "SELECT share_id, filename, mode, password, expires_at, created_at, updated_at 
                    FROM file_shares 
                    WHERE username = ? 
                    ORDER BY created_at DESC";
            $stmt = $conn->prepare($sql);
            $stmt->bind_param("s", $username);
            $stmt->execute();
            $result = $stmt->get_result();

            $shares = [];
            while ($row = $result->fetch_assoc()) {
                $shares[] = [
                    'share_id' => $row['share_id'],
                    'share_url' => $this->getShareUrl($row['share_id']),
                    'filename' => $row['filename'],
                    'mode' => $row['mode'],
                    'has_password' => !empty($row['password']),
                    'expires_at' => $row['expires_at'],
                    'created_at' => $row['created_at'],
                    'is_expired' => $row['expires_at'] && strtotime($row['expires_at']) < time()
                ];
            }

            $stmt->close();

            return [
                'code' => 200,
                'message' => '获取分享列表成功',
                'data' => [
                    'username' => $username,
                    'shares' => $shares,
                    'count' => count($shares)
                ]
            ];

        } catch (Exception $e) {
            error_log("获取分享列表失败: " . $e->getMessage());
            return [
                'code' => 500,
                'message' => '获取分享列表失败: ' . $e->getMessage()
            ];
        }
    }

    /**
     * 删除分享链接
     */
    public function deleteShare($username, $shareId) {
        try {
            $conn = $this->db->getConnection();

            // 验证分享属于该用户
            $checkSql = "SELECT id FROM file_shares WHERE username = ? AND share_id = ?";
            $checkStmt = $conn->prepare($checkSql);
            $checkStmt->bind_param("ss", $username, $shareId);
            $checkStmt->execute();
            $checkResult = $checkStmt->get_result();
            $checkStmt->close();

            if ($checkResult->num_rows === 0) {
                return [
                    'code' => 404,
                    'message' => '分享不存在或无权操作'
                ];
            }

            // 删除分享
            $deleteSql = "DELETE FROM file_shares WHERE username = ? AND share_id = ?";
            $deleteStmt = $conn->prepare($deleteSql);
            $deleteStmt->bind_param("ss", $username, $shareId);

            if (!$deleteStmt->execute()) {
                $error = $deleteStmt->error;
                $deleteStmt->close();
                throw new Exception("删除分享失败: " . $error);
            }

            $affectedRows = $deleteStmt->affected_rows;
            $deleteStmt->close();

            return [
                'code' => 200,
                'message' => '分享删除成功',
                'data' => [
                    'share_id' => $shareId,
                    'affected_rows' => $affectedRows
                ]
            ];

        } catch (Exception $e) {
            error_log("删除分享失败: " . $e->getMessage());
            return [
                'code' => 500,
                'message' => '删除分享失败: ' . $e->getMessage()
            ];
        }
    }

    /**
     * 生成唯一的分享ID
     */
    private function generateShareId() {
        // 生成更唯一的分享ID
        $random = mt_rand() . microtime(true) . uniqid() . rand(1000, 9999);
        return substr(md5($random), 0, 16);
    }

    /**
     * 获取分享URL
     */
    private function getShareUrl($shareId) {
        $baseUrl = $this->config['base_url'] ?? getBaseUrl();

        // 检查baseUrl是否已经包含api路径
        $path = parse_url($baseUrl, PHP_URL_PATH);
        if (strpos($path, '/api') !== false) {
            // 如果已经包含/api，则直接使用index.php
            $apiPath = 'index.php';
        } else {
            // 否则使用完整的api路径
            $apiPath = isset($this->config['api_path']) ? $this->config['api_path'] : 'api/index.php';
        }

        return rtrim($baseUrl, '/') . '/' . ltrim($apiPath, '/') . '?action=view_share&share_id=' . $shareId;
    }

    /**
     * 验证分享访问权限
     */
    public function verifyShareAccess($shareId, $password = null) {
        return $this->getSharedFile($shareId, $password);
    }

    /**
     * 更新分享链接属性
     */
    public function updateShareProperties($username, $shareId, $mode, $expireDays) {
        try {
            $conn = $this->db->getConnection();

            // 验证分享属于该用户
            $checkSql = "SELECT id FROM file_shares WHERE username = ? AND share_id = ?";
            $checkStmt = $conn->prepare($checkSql);
            $checkStmt->bind_param("ss", $username, $shareId);
            $checkStmt->execute();
            $checkResult = $checkStmt->get_result();
            $checkStmt->close();

            if ($checkResult->num_rows === 0) {
                return [
                    'code' => 404,
                    'message' => '分享不存在或无权操作'
                ];
            }

            // 计算过期时间
            $expiresAt = null;
            if ($expireDays > 0) {
                $expiresAt = date('Y-m-d H:i:s', strtotime("+{$expireDays} days"));
            }

            // 更新分享属性
            $updateSql = "UPDATE file_shares SET mode = ?, expires_at = ? WHERE username = ? AND share_id = ?";
            $updateStmt = $conn->prepare($updateSql);
            $updateStmt->bind_param("ssss", $mode, $expiresAt, $username, $shareId);

            if (!$updateStmt->execute()) {
                $error = $updateStmt->error;
                $updateStmt->close();
                throw new Exception("更新分享属性失败: " . $error);
            }

            $updateStmt->close();

            // 获取更新后的分享信息
            $shareSql = "SELECT * FROM file_shares WHERE username = ? AND share_id = ?";
            $shareStmt = $conn->prepare($shareSql);
            $shareStmt->bind_param("ss", $username, $shareId);
            $shareStmt->execute();
            $shareResult = $shareStmt->get_result();
            $share = $shareResult->fetch_assoc();
            $shareStmt->close();

            $shareUrl = $this->getShareUrl($shareId);

            return [
                'code' => 200,
                'message' => '分享属性更新成功',
                'data' => [
                    'share_id' => $shareId,
                    'share_url' => $shareUrl,
                    'mode' => $mode,
                    'expires_at' => $expiresAt
                ]
            ];

        } catch (Exception $e) {
            error_log("更新分享属性失败: " . $e->getMessage());
            return [
                'code' => 500,
                'message' => '更新分享属性失败: ' . $e->getMessage()
            ];
        }
    }
}