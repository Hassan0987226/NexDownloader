import os, sqlite3, secrets, subprocess, uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import jwt
import stripe
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Depends, Header, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from pwdlib import PasswordHash
import yt_dlp

load_dotenv()
APP = FastAPI(title='NexDownloader API', version='1.0.0')
DB = Path(__file__).resolve().parent.parent / 'nexdownloader.db'
DOWNLOADS = Path(__file__).resolve().parent.parent / 'downloads'
DOWNLOADS.mkdir(exist_ok=True)
JWT_SECRET = os.getenv('JWT_SECRET', 'dev-only-change-me')
PRICE = float(os.getenv('PREMIUM_PRICE_USD', '5'))
stripe.api_key = os.getenv('STRIPE_SECRET_KEY')
password_hash = PasswordHash.recommended()


def db():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    return c


def init_db():
    with db() as c:
        c.executescript('''
        CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, premium_until TEXT);
        CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY, user_id INTEGER, provider TEXT NOT NULL, provider_id TEXT UNIQUE, amount REAL, currency TEXT, status TEXT, created_at TEXT, FOREIGN KEY(user_id) REFERENCES users(id));
        CREATE TABLE IF NOT EXISTS downloads(id INTEGER PRIMARY KEY, user_id INTEGER, source_url TEXT, format TEXT, quality TEXT, status TEXT, file_name TEXT, created_at TEXT, FOREIGN KEY(user_id) REFERENCES users(id));
        ''')
init_db()

class Auth(BaseModel):
    email: str
    password: str = Field(min_length=8)
class MediaRequest(BaseModel):
    url: str
    quality: str = '720p'
    format: str = 'MP4'
class CheckoutRequest(BaseModel):
    provider: str = 'stripe'


def token_for(uid: int):
    return jwt.encode({'sub': str(uid), 'exp': datetime.now(timezone.utc) + timedelta(days=7)}, JWT_SECRET, algorithm='HS256')

def current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(401, 'Authentication required')
    try: uid = int(jwt.decode(authorization[7:], JWT_SECRET, algorithms=['HS256'])['sub'])
    except Exception: raise HTTPException(401, 'Invalid or expired token')
    with db() as c: row = c.execute('SELECT * FROM users WHERE id=?', (uid,)).fetchone()
    if not row: raise HTTPException(401, 'User not found')
    return row

def is_premium(user):
    return bool(user['premium_until'] and datetime.fromisoformat(user['premium_until']) > datetime.now(timezone.utc))

def require_allowed_quality(q, premium):
    if q not in {'360p','480p','720p','1080p','1440p','2160p'}: raise HTTPException(400, 'Unsupported quality')
    if q in {'1080p','1440p','2160p'} and not premium: raise HTTPException(402, 'Premium required')

@APP.get('/health')
def health(): return {'ok': True}

@APP.post('/auth/register')
def register(a: Auth):
    email=a.email.strip().lower()
    with db() as c:
        try:
            cur=c.execute('INSERT INTO users(email,password_hash) VALUES(?,?)',(email,password_hash.hash(a.password)))
            uid=cur.lastrowid; c.commit()
        except sqlite3.IntegrityError: raise HTTPException(409,'Email already registered')
    return {'access_token': token_for(uid), 'token_type':'bearer'}

@APP.post('/auth/login')
def login(a: Auth):
    with db() as c: row=c.execute('SELECT * FROM users WHERE email=?',(a.email.strip().lower(),)).fetchone()
    if not row or not password_hash.verify(a.password,row['password_hash']): raise HTTPException(401,'Invalid credentials')
    return {'access_token': token_for(row['id']), 'token_type':'bearer'}

@APP.get('/me')
def me(user=Depends(current_user)):
    return {'id':user['id'],'email':user['email'],'premium':is_premium(user),'premium_until':user['premium_until']}

@APP.post('/analyze')
def analyze(req: MediaRequest, user=Depends(current_user)):
    if not req.url.startswith(('http://','https://')): raise HTTPException(400,'Enter a valid HTTP(S) URL')
    opts={'quiet':True,'no_warnings':True,'skip_download':True}
    try:
        with yt_dlp.YoutubeDL(opts) as ydl: info=ydl.extract_info(req.url, download=False)
    except Exception as e: raise HTTPException(400,f'Unsupported or unavailable source: {e}')
    formats=[]
    for f in info.get('formats',[]):
        h=f.get('height'); ext=f.get('ext')
        if h and ext: formats.append({'height':h,'ext':ext,'has_audio':bool(f.get('acodec') and f.get('acodec')!='none')})
    return {'title':info.get('title'),'duration':info.get('duration'),'formats':formats[-100:]}

@APP.post('/download')
def download(req: MediaRequest, user=Depends(current_user)):
    premium=is_premium(user); require_allowed_quality(req.quality,premium)
    ext=req.format.lower()
    if ext not in {'mp4','webm','mkv','mp3','m4a'}: raise HTTPException(400,'Unsupported format')
    job=str(uuid.uuid4()); out=DOWNLOADS / f'{job}.%(ext)s'
    height=req.quality.replace('p','')
    if ext in {'mp3','m4a'}: fmt='bestaudio/best'
    else: fmt=f'bestvideo[height<={height}]+bestaudio/best[height<={height}]/best[height<={height}]/best'
    opts={'outtmpl':str(out),'format':fmt,'merge_output_format':'mp4' if ext=='mp4' else None,'quiet':True,'noplaylist':True}
    if ext in {'mp3','m4a'}: opts['postprocessors']=[{'key':'FFmpegExtractAudio','preferredcodec':ext,'preferredquality':'192'}]
    try:
        with yt_dlp.YoutubeDL({k:v for k,v in opts.items() if v is not None}) as ydl: ydl.download([req.url])
    except Exception as e: raise HTTPException(400,f'Download failed: {e}')
    files=list(DOWNLOADS.glob(f'{job}.*'))
    if not files: raise HTTPException(500,'Output file was not created. Ensure FFmpeg is installed.')
    f=files[0]
    with db() as c:
        c.execute('INSERT INTO downloads(user_id,source_url,format,quality,status,file_name,created_at) VALUES(?,?,?,?,?,?,?)',(user['id'],req.url,ext,req.quality,'completed',f.name,datetime.now(timezone.utc).isoformat())); c.commit()
    return {'download_url':f'/files/{f.name}','file_name':f.name}

@APP.get('/files/{name}')
def file(name: str, user=Depends(current_user)):
    p=DOWNLOADS / Path(name).name
    if not p.exists(): raise HTTPException(404,'File not found')
    return FileResponse(p, filename=p.name)

@APP.get('/history')
def history(user=Depends(current_user)):
    with db() as c: rows=c.execute('SELECT id,source_url,format,quality,status,file_name,created_at FROM downloads WHERE user_id=? ORDER BY id DESC LIMIT 100',(user['id'],)).fetchall()
    return [dict(r) for r in rows]

@APP.post('/payments/stripe/checkout')
def stripe_checkout(req: CheckoutRequest, user=Depends(current_user)):
    if req.provider!='stripe': raise HTTPException(400,'Use /payments/stripe/checkout for Stripe')
    if not stripe.api_key: raise HTTPException(503,'Stripe is not configured')
    session=stripe.checkout.Session.create(mode='payment',line_items=[{'price':os.getenv('STRIPE_PRICE_ID'),'quantity':1}],metadata={'user_id':str(user['id'])},success_url=os.getenv('PUBLIC_BASE_URL')+'/payment-success',cancel_url=os.getenv('PUBLIC_BASE_URL')+'/payment-cancelled')
    return {'url':session.url}

@APP.post('/payments/stripe/webhook')
async def stripe_webhook(request: Request):
    payload=await request.body(); sig=request.headers.get('stripe-signature'); secret=os.getenv('STRIPE_WEBHOOK_SECRET')
    if not secret: raise HTTPException(503,'Webhook secret is not configured')
    try: event=stripe.Webhook.construct_event(payload,sig,secret)
    except Exception: raise HTTPException(400,'Invalid webhook')
    if event['type']=='checkout.session.completed':
        s=event['data']['object']; uid=int(s['metadata']['user_id']); provider_id=s['id']
        until=datetime.now(timezone.utc)+timedelta(days=30)
        with db() as c:
            c.execute('UPDATE users SET premium_until=? WHERE id=?',(until.isoformat(),uid)); c.execute('INSERT OR IGNORE INTO payments(user_id,provider,provider_id,amount,currency,status,created_at) VALUES(?,?,?,?,?,?,?)',(uid,'stripe',provider_id,PRICE,'usd','paid',datetime.now(timezone.utc).isoformat())); c.commit()
    return {'received':True}

@APP.get('/payments/history')
def payment_history(user=Depends(current_user)):
    with db() as c: rows=c.execute('SELECT provider,provider_id,amount,currency,status,created_at FROM payments WHERE user_id=? ORDER BY id DESC',(user['id'],)).fetchall()
    return [dict(r) for r in rows]

@APP.post('/payments/{provider}/webhook')
def local_provider_webhook(provider: str):
    # Integration point only. Do not activate Premium from unverified client requests.
    if provider not in {'jazzcash','easypaisa'}: raise HTTPException(404,'Provider not supported')
    return {'configured':False,'message':'Add merchant credentials and implement the provider-specific signature/callback verification before production use.'}
