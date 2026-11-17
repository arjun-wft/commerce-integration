import envConfig from './env.js'
import {Pool} from 'pg'

export const pool = new Pool({
    host:envConfig.AIVEN_HOST,
    password:envConfig.AIVEN_PASSWORD,
    user:envConfig.AIVEN_USER,
    max:Number(envConfig.AIVEN_MAX_POOL) || 3,
    port:envConfig.AIVEN_PORT,
    database:envConfig.AIVEN_DATABASE,
    ssl:envConfig.AIVEN_SSL ? { rejectUnauthorized:false } : false,
    connectionTimeoutMillis:30000,
    idleTimeoutMillis:30000,
})

export async function postgreSqlConnectionTest(){
    try{
        const query = await pool.query("SELECT NOW()")
        console.log("Database is Connected Successfuly")
    }
    catch(error:any){
        console.log(`Error While Connecting to Database ${error?.message}`)
    }
}