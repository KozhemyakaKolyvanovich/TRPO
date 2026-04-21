const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcrypt');
require('dotenv').config();

const app = express();
//const PORT = process.env.PORT;  // || 3000;
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Конфигурация БД
const dbConfig = {
    host: '127.0.0.1',
    user: 'root',
    password: '12345678',
    database: 'finance_app',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

let pool;

// Инициализация подключения к БД
async function initDB() {
    try {
        pool = mysql.createPool(dbConfig);
        console.log('✅ Подключено к MySQL');
        
        // Проверяем соединение
        const connection = await pool.getConnection();
        await connection.ping();
        connection.release();
    } catch (error) {
        console.error('❌ Ошибка подключения к MySQL:', error.message);
        process.exit(1);
    }
}

// ============= АВТОРИЗАЦИЯ =============

// Регистрация
app.post('/api/register', async (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ error: 'Email и пароль обязательны' });
    }
    
    try {
        // В реальном приложении пароль нужно хешировать!
        // const hashedPassword = await bcrypt.hash(password, 10);
        
        const [result] = await pool.execute(
            'INSERT INTO users (email, password) VALUES (?, ?)',
            [email, password] // В продакшене используйте hashedPassword
        );
        
        // Создаём стандартные категории для нового пользователя
        const defaultCategories = [
            { name: 'Зарплата', type: 'income' },
            { name: 'Фриланс', type: 'income' },
            { name: 'Продукты', type: 'expense' },
            { name: 'Транспорт', type: 'expense' },
            { name: 'Кафе', type: 'expense' }
        ];
        
        for (const cat of defaultCategories) {
            await pool.execute(
                'INSERT INTO categories (user_id, name, type) VALUES (?, ?, ?)',
                [result.insertId, cat.name, cat.type]
            );
        }
        
        res.json({ success: true, userId: result.insertId });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(400).json({ error: 'Пользователь уже существует' });
        } else {
            console.error(error);
            res.status(500).json({ error: 'Ошибка сервера' });
        }
    }
});

// Авторизация
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    
    try {
        const [users] = await pool.execute(
            'SELECT * FROM users WHERE email = ? AND password = ?',
            [email, password]
        );
        
        if (users.length === 0) {
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }
        
        // В реальном приложении используйте JWT токен
        res.json({ 
            success: true, 
            user: { 
                id: users[0].id, 
                email: users[0].email 
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ============= КАТЕГОРИИ =============

// Получить все категории пользователя
app.get('/api/categories/:userId', async (req, res) => {
    const { userId } = req.params;
    
    try {
        const [categories] = await pool.execute(
            'SELECT * FROM categories WHERE user_id = ? ORDER BY type, name',
            [userId]
        );
        res.json(categories);
    } catch (error) {
        res.status(500).json({ error: 'Ошибка получения категорий' });
    }
});

// Создать категорию
app.post('/api/categories', async (req, res) => {
    const { userId, name, type } = req.body;
    
    if (!name || !type) {
        return res.status(400).json({ error: 'Название и тип обязательны' });
    }
    
    try {
        const [result] = await pool.execute(
            'INSERT INTO categories (user_id, name, type) VALUES (?, ?, ?)',
            [userId, name, type]
        );
        
        const [newCategory] = await pool.execute(
            'SELECT * FROM categories WHERE id = ?',
            [result.insertId]
        );
        
        res.json(newCategory[0]);
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(400).json({ error: 'Категория с таким названием уже существует' });
        } else {
            res.status(500).json({ error: 'Ошибка создания категории' });
        }
    }
});

// Обновить категорию
app.put('/api/categories/:id', async (req, res) => {
    const { id } = req.params;
    const { name, type, userId } = req.body;
    
    try {
        await pool.execute(
            'UPDATE categories SET name = ?, type = ? WHERE id = ? AND user_id = ?',
            [name, type, id, userId]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка обновления категории' });
    }
});

// Удалить категорию
app.delete('/api/categories/:id', async (req, res) => {
    const { id } = req.params;
    const { userId } = req.body;
    
    try {
        // Проверяем, есть ли транзакции с этой категорией
        const [transactions] = await pool.execute(
            'SELECT COUNT(*) as count FROM transactions WHERE category_id = ? AND user_id = ?',
            [id, userId]
        );
        
        if (transactions[0].count > 0) {
            return res.status(400).json({ 
                error: 'Невозможно удалить категорию: существуют связанные транзакции' 
            });
        }
        
        await pool.execute(
            'DELETE FROM categories WHERE id = ? AND user_id = ?',
            [id, userId]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка удаления категории' });
    }
});

// ============= ТРАНЗАКЦИИ =============

// Получить транзакции с фильтрацией
app.get('/api/transactions/:userId', async (req, res) => {
    const { userId } = req.params;
    const { categoryId, type, dateFrom, dateTo } = req.query;
    
    let query = `
        SELECT t.*, c.name as category_name, c.type as category_type
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = ?
    `;
    const params = [userId];
    
    if (categoryId && categoryId !== 'all') {
        query += ' AND t.category_id = ?';
        params.push(categoryId);
    }
    
    if (type && type !== 'all') {
        query += ' AND c.type = ?';
        params.push(type);
    }
    
    if (dateFrom) {
        query += ' AND t.date >= ?';
        params.push(dateFrom);
    }
    
    if (dateTo) {
        query += ' AND t.date <= ?';
        params.push(dateTo);
    }
    
    query += ' ORDER BY t.date DESC, t.created_at DESC';
    
    try {
        const [transactions] = await pool.execute(query, params);
        res.json(transactions);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка получения транзакций' });
    }
});

// Создать транзакцию
app.post('/api/transactions', async (req, res) => {
    const { userId, amount, date, categoryId, comment } = req.body;
    
    if (!amount || amount <= 0 || !date || !categoryId) {
        return res.status(400).json({ error: 'Неверные данные транзакции' });
    }
    
    try {
        const [result] = await pool.execute(
            'INSERT INTO transactions (user_id, amount, date, category_id, comment) VALUES (?, ?, ?, ?, ?)',
            [userId, amount, date, categoryId, comment || '']
        );
        
        const [newTransaction] = await pool.execute(
            `SELECT t.*, c.name as category_name, c.type as category_type 
             FROM transactions t 
             JOIN categories c ON t.category_id = c.id 
             WHERE t.id = ?`,
            [result.insertId]
        );
        
        res.json(newTransaction[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка создания транзакции' });
    }
});

// Обновить транзакцию
app.put('/api/transactions/:id', async (req, res) => {
    const { id } = req.params;
    const { userId, amount, date, categoryId, comment } = req.body;
    
    try {
        await pool.execute(
            'UPDATE transactions SET amount = ?, date = ?, category_id = ?, comment = ? WHERE id = ? AND user_id = ?',
            [amount, date, categoryId, comment, id, userId]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка обновления транзакции' });
    }
});

// Удалить транзакцию
app.delete('/api/transactions/:id', async (req, res) => {
    const { id } = req.params;
    const { userId } = req.body;
    
    try {
        await pool.execute(
            'DELETE FROM transactions WHERE id = ? AND user_id = ?',
            [id, userId]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка удаления транзакции' });
    }
});

// Получить отчёт
app.get('/api/report/:userId', async (req, res) => {
    const { userId } = req.params;
    const { dateFrom, dateTo, categoryId, type } = req.query;
    
    let query = `
        SELECT 
            SUM(CASE WHEN c.type = 'income' THEN t.amount ELSE 0 END) as total_income,
            SUM(CASE WHEN c.type = 'expense' THEN t.amount ELSE 0 END) as total_expense
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = ?
    `;
    const params = [userId];
    
    if (dateFrom) {
        query += ' AND t.date >= ?';
        params.push(dateFrom);
    }
    
    if (dateTo) {
        query += ' AND t.date <= ?';
        params.push(dateTo);
    }
    
    if (categoryId && categoryId !== 'all') {
        query += ' AND t.category_id = ?';
        params.push(categoryId);
    }
    
    if (type && type !== 'all') {
        query += ' AND c.type = ?';
        params.push(type);
    }
    
    try {
        const [result] = await pool.execute(query, params);
        const totals = result[0];
        res.json({
            totalIncome: totals.total_income || 0,
            totalExpense: totals.total_expense || 0,
            balance: (totals.total_income || 0) - (totals.total_expense || 0)
        });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка получения отчёта' });
    }
});

// Запуск сервера
async function startServer() {
    await initDB();
    app.listen(PORT, () => {
        console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
    });
}

startServer();