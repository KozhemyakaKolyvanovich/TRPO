-- Создание базы данных
CREATE DATABASE IF NOT EXISTS finance_app;
USE finance_app;

-- Таблица пользователей
CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL, -- В реальном приложении хешировать!
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица категорий
CREATE TABLE IF NOT EXISTS categories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    type ENUM('income', 'expense') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_category (user_id, name, type)
);

-- Таблица транзакций
CREATE TABLE IF NOT EXISTS transactions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
    date DATE NOT NULL,
    category_id INT NOT NULL,
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
    INDEX idx_user_date (user_id, date),
    INDEX idx_user_category (user_id, category_id)
);

-- Добавляем начальные категории для демо-пользователя
-- Сначала создадим демо-пользователя (пароль: 123)
INSERT INTO users (email, password) VALUES ('demo@example.com', '123');
-- Получаем его ID (предполагаем что ID=1)
INSERT INTO categories (user_id, name, type) VALUES
(1, 'Зарплата', 'income'),
(1, 'Фриланс', 'income'),
(1, 'Продукты', 'expense'),
(1, 'Транспорт', 'expense'),
(1, 'Кафе', 'expense');

-- Добавляем тестовые транзакции
INSERT INTO transactions (user_id, amount, date, category_id, comment) VALUES
(1, 85000, '2025-03-01', 1, 'ЗП за февраль'),
(1, 3200, '2025-03-05', 3, 'Супермаркет'),
(1, 15000, '2025-03-10', 2, 'Проект'),
(1, 450, '2025-03-12', 4, 'Метро');