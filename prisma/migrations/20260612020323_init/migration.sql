-- CreateTable
CREATE TABLE `gateway_logs` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `line_hash` CHAR(64) NOT NULL,
    `consumer_id` VARCHAR(255) NULL,
    `service_id` VARCHAR(255) NULL,
    `service_name` VARCHAR(255) NULL,
    `route_id` VARCHAR(255) NULL,
    `request_method` VARCHAR(10) NULL,
    `request_uri` TEXT NULL,
    `request_url` TEXT NULL,
    `request_size` INTEGER NULL,
    `request_querystring` TEXT NULL,
    `response_status` SMALLINT NULL,
    `response_size` INTEGER NULL,
    `upstream_uri` TEXT NULL,
    `client_ip` VARCHAR(45) NULL,
    `latency_proxy` INTEGER NULL,
    `latency_gateway` INTEGER NULL,
    `latency_request` INTEGER NULL,
    `created_at` DATETIME(3) NULL,
    `processed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `gateway_logs_line_hash_key`(`line_hash`),
    INDEX `gateway_logs_consumer_id_idx`(`consumer_id`),
    INDEX `gateway_logs_service_name_idx`(`service_name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gateway_log_failures` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `line_hash` CHAR(64) NOT NULL,
    `raw_line` MEDIUMTEXT NOT NULL,
    `error_message` TEXT NOT NULL,
    `failed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
