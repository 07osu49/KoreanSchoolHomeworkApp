import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { handleBackup } from '../../../server/backup';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handleBackup(request,env,await getChatGPTUser())}
export async function POST(request:Request){return handleBackup(request,env,await getChatGPTUser())}
