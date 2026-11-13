import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export function nativeDownloadGrantsMigration(){return {
  id:'0014_native_download_grants',
  definition:readFileSync(fileURLToPath(import.meta.url),'utf8').replace(/\r\n/g,'\n'),
  run:async connection=>{
    await connection.query(`CREATE TABLE IF NOT EXISTS native_download_grants (
      token_hash CHAR(64) PRIMARY KEY,
      invitation_token_hash CHAR(64) NOT NULL,
      network_id VARCHAR(64) NOT NULL,
      platform ENUM('ANDROID','WINDOWS') NOT NULL,
      browser_platform ENUM('ANDROID','WINDOWS') NOT NULL,
      issued_at DATETIME(3) NOT NULL,
      expires_at DATETIME(3) NOT NULL,
      redeemed_at DATETIME(3) NULL,
      CONSTRAINT fk_native_download_network FOREIGN KEY (network_id) REFERENCES distributed_networks(id) ON DELETE CASCADE,
      INDEX idx_native_download_expiry (expires_at)
    ) ENGINE=InnoDB`);
  }
};}
