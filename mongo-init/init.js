// MongoDB initialization script
db = db.getSiblingDB('noteable');

// Create a user for the application
db.createUser({
  user: 'noteable_user',
  pwd: 'noteable_password',
  roles: [
    {
      role: 'readWrite',
      db: 'noteable'
    }
  ]
});

// Create collections
db.createCollection('notes');

print('Database initialized successfully!');
