// AI対戦用の高度なAIシステム
class AIOpponent {
    constructor(player2, player1, canvas, obstacles, weapons) {
        this.player2 = player2;
        this.player1 = player1;
        this.canvas = canvas;
        this.obstacles = obstacles;
        this.weapons = weapons;
        
        // AIの状態管理
        this.state = 'hunting'; // hunting, evading, attacking, repositioning
        this.lastStateChange = Date.now();
        this.targetX = player1.x;
        this.targetY = player1.y;
        this.lastAttackTime = 0;
        this.attackCooldown = 500;
        this.evasionTimer = 0;
        this.verticalMovementTimer = 0;
        this.verticalDirection = 1; // 1: 上向き, -1: 下向き
    }
    
    // 戦略的移動
    move() {
        const dx = this.targetX - this.player2.x;
        const dy = this.targetY - this.player2.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // 移動制限を考慮
        const minY = 0;
        const maxY = this.canvas.height / 2 - this.player2.height;
        
        // 障害物回避を考慮した移動
        const newX = this.player2.x + (dx > 0 ? this.player2.speed : -this.player2.speed);
        const newY = this.player2.y + (dy > 0 ? this.player2.speed : -this.player2.speed);
        
        // 左右移動（障害物チェック付き）
        if (Math.abs(dx) > 10) {
            const testPlayer = {
                x: newX,
                y: this.player2.y,
                width: this.player2.width,
                height: this.player2.height
            };
            
            // 障害物との衝突をチェック
            let canMoveX = true;
            this.obstacles.forEach(obstacle => {
                if (this.checkCollision(testPlayer, obstacle)) {
                    canMoveX = false;
                }
            });
            
            if (canMoveX && newX >= 0 && newX <= this.canvas.width - this.player2.width) {
                this.player2.x = newX;
            } else {
                // 障害物がある場合、上下移動で回避を試みる
                this.avoidObstacle();
            }
        }
        
        // 上下移動（制限内で、障害物チェック付き）
        if (Math.abs(dy) > 10) {
            const testPlayer = {
                x: this.player2.x,
                y: newY,
                width: this.player2.width,
                height: this.player2.height
            };
            
            // 障害物との衝突をチェック
            let canMoveY = true;
            this.obstacles.forEach(obstacle => {
                if (this.checkCollision(testPlayer, obstacle)) {
                    canMoveY = false;
                }
            });
            
            if (canMoveY && newY >= minY && newY <= maxY) {
                this.player2.y = newY;
            }
        }
        
        // 縦移動の追加（戦略的な上下移動）
        this.performVerticalMovement();
    }
    
    // 縦移動の実装
    performVerticalMovement() {
        const now = Date.now();
        const minY = 0;
        const maxY = this.canvas.height / 2 - this.player2.height;
        
        // 縦移動タイマーの更新
        if (now - this.verticalMovementTimer > 2000) { // 2秒ごとに方向変更
            this.verticalMovementTimer = now;
            this.verticalDirection = Math.random() > 0.5 ? 1 : -1;
        }
        
        // 縦移動の実行
        const newY = this.player2.y + (this.verticalDirection * this.player2.speed);
        if (newY >= minY && newY <= maxY) {
            // 障害物チェック
            const testPlayer = {
                x: this.player2.x,
                y: newY,
                width: this.player2.width,
                height: this.player2.height
            };
            
            let canMoveY = true;
            this.obstacles.forEach(obstacle => {
                if (this.checkCollision(testPlayer, obstacle)) {
                    canMoveY = false;
                }
            });
            
            if (canMoveY) {
                this.player2.y = newY;
            } else {
                // 障害物がある場合は方向を反転
                this.verticalDirection *= -1;
            }
        } else {
            // 境界に達した場合は方向を反転
            this.verticalDirection *= -1;
        }
    }
    
    // 攻撃判定
    attack() {
        const now = Date.now();
        if (now - this.lastAttackTime < this.attackCooldown) return;
        
        // プレイヤーとの距離を計算
        const dx = this.player1.x - this.player2.x;
        const dy = this.player1.y - this.player2.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // 攻撃可能距離内にいる場合
        if (distance < 300 && Math.abs(dx) < 100) {
            // 武器選択（状況に応じて）
            let weaponChoice = 1; // デフォルトは通常弾
            
            if (distance < 150) {
                weaponChoice = 3; // 近距離では散弾
            } else if (distance < 250) {
                weaponChoice = 2; // 中距離では連射弾
            }
            
            const weapon = this.weapons[weaponChoice];
            if (this.player2.ammo >= weapon.ammoCost) {
                // 攻撃実行
                for (let i = 0; i < weapon.bulletCount; i++) {
                    const spread = (i - (weapon.bulletCount - 1) / 2) * weapon.spread;
                    const bullet = {
                        x: this.player2.x + this.player2.width / 2,
                        y: this.player2.y + this.player2.height,
                        width: 4,
                        height: 8,
                        speedX: spread,
                        speedY: weapon.speed,
                        color: weapon.color,
                        playerId: 2
                    };
                    this.player2.bullets.push(bullet);
                }
                this.player2.ammo -= weapon.ammoCost;
                this.lastAttackTime = now;
                this.attackCooldown = 300 + Math.random() * 400; // 動的クールダウン
            }
        }
    }
    
    // 回避行動
    evade() {
        // プレイヤーの弾丸を回避
        const incomingBullets = this.player1.bullets.filter(bullet => 
            bullet.y < this.canvas.height / 2 && 
            Math.abs(bullet.x - this.player2.x) < 50
        );
        
        if (incomingBullets.length > 0) {
            // 回避移動
            const evadeDirection = Math.random() > 0.5 ? 1 : -1;
            const newX = this.player2.x + (evadeDirection * this.player2.speed * 2);
            
            if (newX >= 0 && newX <= this.canvas.width - this.player2.width) {
                this.player2.x = newX;
            }
            
            this.evasionTimer = Date.now() + 1000; // 1秒間回避モード
        }
    }
    
    // 障害物回避
    avoidObstacle() {
        // 現在位置から障害物を検出
        const nearbyObstacles = this.obstacles.filter(obstacle => {
            const dx = obstacle.x - this.player2.x;
            const dy = obstacle.y - this.player2.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            return distance < 100; // 100px以内の障害物
        });
        
        if (nearbyObstacles.length > 0) {
            // 最も近い障害物を取得
            const closestObstacle = nearbyObstacles.reduce((closest, obstacle) => {
                const dx = obstacle.x - this.player2.x;
                const dy = obstacle.y - this.player2.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                const closestDx = closest.x - this.player2.x;
                const closestDy = closest.y - this.player2.y;
                const closestDistance = Math.sqrt(closestDx * closestDx + closestDy * closestDy);
                
                return distance < closestDistance ? obstacle : closest;
            });
            
            // 障害物から離れる方向を計算
            const dx = this.player2.x - closestObstacle.x;
            const dy = this.player2.y - closestObstacle.y;
            
            // 回避方向を決定（左右優先）
            let avoidX = 0;
            let avoidY = 0;
            
            if (Math.abs(dx) < Math.abs(dy)) {
                // 左右回避
                avoidX = dx > 0 ? this.player2.speed * 2 : -this.player2.speed * 2;
            } else {
                // 上下回避
                avoidY = dy > 0 ? this.player2.speed * 2 : -this.player2.speed * 2;
            }
            
            // 回避移動を実行
            const newX = this.player2.x + avoidX;
            const newY = this.player2.y + avoidY;
            
            // 境界チェック
            if (newX >= 0 && newX <= this.canvas.width - this.player2.width) {
                this.player2.x = newX;
            }
            
            const minY = 0;
            const maxY = this.canvas.height / 2 - this.player2.height;
            if (newY >= minY && newY <= maxY) {
                this.player2.y = newY;
            }
        }
    }
    
    // 障害物回避の優先チェック
    checkAndAvoidObstacles() {
        // 現在位置で障害物との衝突をチェック
        const isColliding = this.obstacles.some(obstacle => 
            this.checkCollision(this.player2, obstacle)
        );
        
        if (isColliding) {
            // 衝突している場合は即座に回避
            this.avoidObstacle();
            // 回避状態に切り替え
            this.state = 'evading';
            this.evasionTimer = Date.now() + 2000; // 2秒間回避モード
        }
    }
    
    // 戦略的思考
    think() {
        const now = Date.now();
        
        // 状態変更の判定
        if (now - this.lastStateChange > 3000) { // 3秒ごとに状態を再評価
            this.lastStateChange = now;
            
            // HPに基づく戦略変更
            if (this.player2.hp < 30) {
                this.state = 'evading';
            } else if (this.player1.hp < 50) {
                this.state = 'attacking';
            } else {
                this.state = 'hunting';
            }
        }
        
        // 回避タイマーが有効な場合
        if (now < this.evasionTimer) {
            this.state = 'evading';
        }
        
        // 状態に基づく行動
        switch (this.state) {
            case 'hunting':
                this.targetX = this.player1.x;
                this.targetY = Math.max(50, this.player1.y - 100); // 少し上に位置取る
                this.move();
                this.attack();
                break;
                
            case 'evading':
                this.evade();
                this.targetX = this.canvas.width / 2; // 中央に移動
                this.targetY = 100;
                this.move();
                break;
                
            case 'attacking':
                this.targetX = this.player1.x;
                this.targetY = Math.max(50, this.player1.y - 80);
                this.move();
                this.attack();
                this.attackCooldown = 200; // 攻撃頻度を上げる
                break;
                
            case 'repositioning':
                this.targetX = this.canvas.width / 2;
                this.targetY = 150;
                this.move();
                break;
        }
        
        // 障害物回避の優先チェック（全状態で実行）
        this.checkAndAvoidObstacles();
    }
    
    // 衝突判定
    checkCollision(rect1, rect2) {
        return rect1.x < rect2.x + rect2.width &&
               rect1.x + rect1.width > rect2.x &&
               rect1.y < rect2.y + rect2.height &&
               rect1.y + rect1.height > rect2.y;
    }
    
    // AIの実行
    execute() {
        this.think();
    }
}

// グローバルにエクスポート
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIOpponent;
} else {
    window.AIOpponent = AIOpponent;
} 