import mysql from 'mysql2'
import dotenv from 'dotenv'

dotenv.config()



const connection = mysql.createPool({
  connectionLimit: 10,
  host     : process.env.MYSQLHOST,
  user     : process.env.MYSQLUSER,
  password : process.env.MYSQLPASSWORD,
  port     : 3306,
  database: 'mydatabase',
  connectTimeout: 25000,
  queueLimit: 0
});




export default connection
