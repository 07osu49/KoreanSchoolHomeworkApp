import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { handleExchange } from '../../../server/exchange';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handleExchange(request,env,await getChatGPTUser())}
export async function POST(request:Request){return handleExchange(request,env,await getChatGPTUser())}
