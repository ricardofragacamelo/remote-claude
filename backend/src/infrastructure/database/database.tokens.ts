/** DI tokens of the database connection. Kept apart so an adapter does not import the bootstrap. */
export const DATABASE_CONNECTION = Symbol('DatabaseConnection');
export const DATABASE = Symbol('Database');
export const DATABASE_POOL = Symbol('DatabasePool');
