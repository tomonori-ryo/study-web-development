// AI対戦用の高度なAIシステム
class AIOpponent {
    constructor(player2, player1, canvas, obstacles, weapons) {
        this.player2 = player2;
        this.player1 = player1;
        this.canvas = canvas;
        this.obstacles = obstacles;
        this.weapons = weapons;
        
        // AIの状態管理
        this.state = 'hunting'; // hunting, evading, attacking, repositioning, flanking, ambush
        this.lastStateChange = Date.now();
        this.targetX = player1.x;
        this.targetY = player1.y;
        this.lastAttackTime = 0;
        this.attackCooldown = 500;
        this.evasionTimer = 0;
        this.verticalMovementTimer = 0;
        this.verticalDirection = 1; // 1: 上向き, -1: 下向き
        
        // 高度なAI機能
        this.difficulty = 'hard'; // easy, medium, hard, expert
        this.predictionAccuracy = 0.8; // 予測精度
        this.learningRate = 0.1; // 学習率
        this.patternMemory = []; // パターン記憶
        this.playerPatterns = []; // プレイヤーの行動パターン
        this.successfulMoves = []; // 成功した移動
        this.failedMoves = []; // 失敗した移動
        this.lastPlayerPosition = { x: player1.x, y: player1.y };
        this.playerVelocity = { x: 0, y: 0 };
        this.predictedPosition = { x: player1.x, y: player1.y };
        this.ambushTimer = 0;
        this.flankTimer = 0;
        this.psychologicalTimer = 0;
        this.weaponPreference = this.initializeWeaponPreference();
        this.tacticalMemory = new Map(); // 戦術的記憶
    }
    
    // 武器選択の初期化
    initializeWeaponPreference() {
        return {
            1: { success: 0, attempts: 0, lastUsed: 0 }, // 通常弾
            2: { success: 0, attempts: 0, lastUsed: 0 }, // 連射弾
            3: { success: 0, attempts: 0, lastUsed: 0 }, // 散弾
            4: { success: 0, attempts: 0, lastUsed: 0 }  // レーザー
        };
    }
    
    // 戦略的移動（改善版）
    move() {
        const dx = this.targetX - this.player2.x;
        const dy = this.targetY - this.player2.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // 移動制限を考慮
        const minY = 0;
        const maxY = this.canvas.height / 2 - this.player2.height;
        
        // 現在位置で障害物と衝突しているかチェック
        const isCurrentlyColliding = this.checkCurrentCollision();
        
        if (isCurrentlyColliding) {
            // 現在衝突している場合は即座に回避
            this.emergencyAvoidObstacle();
            return;
        }
        
        // 目標に向かって移動
        let moved = false;
        
        // 左右移動
        if (Math.abs(dx) > 5) {
            const moveDirection = dx > 0 ? 1 : -1;
            const newX = this.player2.x + (moveDirection * this.player2.speed);
            
            if (this.canMoveTo(newX, this.player2.y)) {
                this.player2.x = newX;
                moved = true;
            }
        }
        
        // 上下移動
        if (Math.abs(dy) > 5) {
            const moveDirection = dy > 0 ? 1 : -1;
            const newY = this.player2.y + (moveDirection * this.player2.speed);
            
            if (newY >= minY && newY <= maxY && this.canMoveTo(this.player2.x, newY)) {
                this.player2.y = newY;
                moved = true;
            }
        }
        
        // 移動できなかった場合の代替戦略
        if (!moved && distance > 20) {
            this.findAlternativePath();
        }
        
        // 縦移動の追加（戦略的な上下移動）
        this.performVerticalMovement();
    }
    
    // 現在位置での衝突チェック
    checkCurrentCollision() {
        const currentPosition = {
            x: this.player2.x,
            y: this.player2.y,
            width: this.player2.width,
            height: this.player2.height
        };
        
        return this.obstacles.some(obstacle => this.checkCollision(currentPosition, obstacle));
    }
    
    // 指定位置に移動可能かチェック
    canMoveTo(x, y) {
        // 境界チェック
        if (x < 0 || x > this.canvas.width - this.player2.width) return false;
        if (y < 0 || y > this.canvas.height / 2 - this.player2.height) return false;
        
        // 障害物チェック
        const testPosition = {
            x: x,
            y: y,
            width: this.player2.width,
            height: this.player2.height
        };
        
        return !this.obstacles.some(obstacle => this.checkCollision(testPosition, obstacle));
    }
    
    // 緊急回避
    emergencyAvoidObstacle() {
        // 現在位置から最も近い安全な位置を探す
        const directions = [
            { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
            { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 }
        ];
        
        for (let i = 0; i < directions.length; i++) {
            const dir = directions[i];
            const newX = this.player2.x + (dir.x * this.player2.speed * 2);
            const newY = this.player2.y + (dir.y * this.player2.speed * 2);
            
            if (this.canMoveTo(newX, newY)) {
                this.player2.x = newX;
                this.player2.y = newY;
                return;
            }
        }
        
        // どの方向にも移動できない場合はランダムな位置に移動
        this.moveToRandomSafePosition();
    }
    
    // ランダムな安全な位置に移動
    moveToRandomSafePosition() {
        for (let attempts = 0; attempts < 10; attempts++) {
            const randomX = Math.random() * (this.canvas.width - this.player2.width);
            const randomY = Math.random() * (this.canvas.height / 2 - this.player2.height);
            
            if (this.canMoveTo(randomX, randomY)) {
                this.player2.x = randomX;
                this.player2.y = randomY;
                return;
            }
        }
    }
    
    // 代替経路を見つける
    findAlternativePath() {
        // 目標の反対側からアプローチ
        const alternativeX = this.targetX + (this.targetX > this.canvas.width / 2 ? -100 : 100);
        const alternativeY = this.targetY;
        
        if (this.canMoveTo(alternativeX, alternativeY)) {
            this.targetX = alternativeX;
            this.targetY = alternativeY;
        }
    }
    
    // プレイヤー予測システム
    predictPlayerMovement() {
        const currentTime = Date.now();
        const timeDelta = (currentTime - this.lastStateChange) / 1000;
        
        // プレイヤーの速度を計算
        this.playerVelocity.x = this.player1.x - this.lastPlayerPosition.x;
        this.playerVelocity.y = this.player1.y - this.lastPlayerPosition.y;
        
        // 予測位置を計算
        this.predictedPosition.x = this.player1.x + (this.playerVelocity.x * this.predictionAccuracy);
        this.predictedPosition.y = this.player1.y + (this.playerVelocity.y * this.predictionAccuracy);
        
        // パターン記憶に追加
        this.patternMemory.push({
            time: currentTime,
            position: { x: this.player1.x, y: this.player1.y },
            velocity: { ...this.playerVelocity },
            state: this.state
        });
        
        // 古いパターンを削除（最新の50個を保持）
        if (this.patternMemory.length > 50) {
            this.patternMemory.shift();
        }
        
        this.lastPlayerPosition = { x: this.player1.x, y: this.player1.y };
    }
    
    // パターン学習システム
    learnFromPatterns() {
        if (this.patternMemory.length < 10) return;
        
        // 最近のパターンを分析
        const recentPatterns = this.patternMemory.slice(-10);
        const movementPattern = this.analyzeMovementPattern(recentPatterns);
        
        // 成功した戦術を記憶
        if (this.state === 'attacking' && this.lastAttackTime > 0) {
            const timeSinceLastAttack = Date.now() - this.lastAttackTime;
            if (timeSinceLastAttack < 1000) { // 1秒以内に攻撃
                this.successfulMoves.push({
                    pattern: movementPattern,
                    tactic: this.state,
                    timestamp: Date.now()
                });
            }
        }
        
        // 失敗した戦術を記憶
        if (this.player2.hp < this.player1.hp) {
            this.failedMoves.push({
                pattern: movementPattern,
                tactic: this.state,
                timestamp: Date.now()
            });
        }
    }
    
    // 移動パターン分析
    analyzeMovementPattern(patterns) {
        let horizontalMovement = 0;
        let verticalMovement = 0;
        let averageSpeed = 0;
        
        patterns.forEach((pattern, index) => {
            if (index > 0) {
                const prevPattern = patterns[index - 1];
                horizontalMovement += Math.abs(pattern.position.x - prevPattern.position.x);
                verticalMovement += Math.abs(pattern.position.y - prevPattern.position.y);
                averageSpeed += Math.sqrt(
                    Math.pow(pattern.position.x - prevPattern.position.x, 2) +
                    Math.pow(pattern.position.y - prevPattern.position.y, 2)
                );
            }
        });
        
        return {
            horizontalTendency: horizontalMovement / patterns.length,
            verticalTendency: verticalMovement / patterns.length,
            averageSpeed: averageSpeed / patterns.length,
            isAggressive: averageSpeed > 5,
            isDefensive: averageSpeed < 2
        };
    }
    
    // 縦移動の実装（改善版）
    performVerticalMovement() {
        const now = Date.now();
        const minY = 0;
        const maxY = this.canvas.height / 2 - this.player2.height;
        
        // 予測に基づく縦移動
        const predictedPlayerY = this.predictedPosition.y;
        const distanceToPlayer = Math.abs(this.player2.y - predictedPlayerY);
        
        // 戦略的縦移動
        if (distanceToPlayer > 50) {
            // プレイヤーに近づく
            this.verticalDirection = this.player2.y > predictedPlayerY ? -1 : 1;
        } else if (now - this.verticalMovementTimer > 3000) {
            // 3秒ごとにランダム方向変更
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
    
    // 高度な攻撃システム（改善版）
    attack() {
        const now = Date.now();
        if (now - this.lastAttackTime < this.attackCooldown) return;
        
        // プレイヤーとの距離を計算
        const dx = this.player1.x - this.player2.x;
        const dy = this.player1.y - this.player2.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // 予測位置での攻撃
        const predictedDx = this.predictedPosition.x - this.player2.x;
        const predictedDy = this.predictedPosition.y - this.player2.y;
        const predictedDistance = Math.sqrt(predictedDx * predictedDx + predictedDy * predictedDy);
        
        // 攻撃条件を緩和（より積極的に攻撃）
        const canAttack = (predictedDistance < 400 && Math.abs(predictedDx) < 150) || 
                         (distance < 350 && Math.abs(dx) < 120);
        
        if (canAttack) {
            // 高度な武器選択
            const weaponChoice = this.selectOptimalWeapon(Math.min(predictedDistance, distance));
            const weapon = this.weapons[weaponChoice];
            
            if (this.player2.ammo >= weapon.ammoCost) {
                // 予測位置に向けて攻撃
                this.executePredictedAttack(weapon, predictedDx, predictedDy);
                this.lastAttackTime = now;
                this.updateWeaponPreference(weaponChoice, true);
                this.attackCooldown = this.calculateDynamicCooldown();
                
                // 攻撃成功の記録
                this.recordSuccessfulAttack();
            } else {
                // 弾薬がない場合は通常弾を使用
                this.executeBasicAttack();
            }
        }
    }
    
    // 基本攻撃（弾薬がない場合）
    executeBasicAttack() {
        const weapon = this.weapons[1]; // 通常弾
        const dx = this.player1.x - this.player2.x;
        const dy = this.player1.y - this.player2.y;
        
        const bullet = {
            x: this.player2.x + this.player2.width / 2,
            y: this.player2.y + this.player2.height,
            width: 4,
            height: 8,
            speedX: dx > 0 ? 2 : -2,
            speedY: weapon.speed,
            color: weapon.color,
            playerId: 2
        };
        
        this.player2.bullets.push(bullet);
        this.lastAttackTime = Date.now();
        this.attackCooldown = 500;
    }
    
    // 攻撃成功の記録
    recordSuccessfulAttack() {
        this.successfulMoves.push({
            pattern: { type: 'attack', timestamp: Date.now() },
            tactic: this.state,
            timestamp: Date.now()
        });
    }
    
    // 最適武器選択
    selectOptimalWeapon(distance) {
        // 武器の成功率を考慮
        const weaponScores = {};
        Object.keys(this.weaponPreference).forEach(weaponId => {
            const weapon = this.weaponPreference[weaponId];
            const successRate = weapon.attempts > 0 ? weapon.success / weapon.attempts : 0.5;
            const timeSinceLastUse = Date.now() - weapon.lastUsed;
            
            // 距離に基づく基本スコア
            let baseScore = 0;
            if (distance < 150) {
                baseScore = weaponId == 3 ? 10 : 5; // 散弾が近距離で有利
            } else if (distance < 250) {
                baseScore = weaponId == 2 ? 10 : 5; // 連射弾が中距離で有利
            } else {
                baseScore = weaponId == 1 ? 10 : 5; // 通常弾が遠距離で有利
            }
            
            weaponScores[weaponId] = baseScore * successRate * (1 + timeSinceLastUse / 10000);
        });
        
        // 最高スコアの武器を選択
        let bestWeapon = 1;
        let bestScore = 0;
        Object.keys(weaponScores).forEach(weaponId => {
            if (weaponScores[weaponId] > bestScore) {
                bestScore = weaponScores[weaponId];
                bestWeapon = parseInt(weaponId);
            }
        });
        
        return bestWeapon;
    }
    
    // 予測攻撃実行
    executePredictedAttack(weapon, predictedDx, predictedDy) {
        // 予測位置に向けて攻撃
        const angle = Math.atan2(predictedDy, predictedDx);
        
        for (let i = 0; i < weapon.bulletCount; i++) {
            const spread = (i - (weapon.bulletCount - 1) / 2) * weapon.spread;
            const bullet = {
                x: this.player2.x + this.player2.width / 2,
                y: this.player2.y + this.player2.height,
                width: 4,
                height: 8,
                speedX: Math.cos(angle) * weapon.speed + spread,
                speedY: Math.sin(angle) * weapon.speed,
                color: weapon.color,
                playerId: 2
            };
            this.player2.bullets.push(bullet);
        }
        
        this.player2.ammo -= weapon.ammoCost;
    }
    
    // 武器選択の更新
    updateWeaponPreference(weaponId, wasSuccessful) {
        const weapon = this.weaponPreference[weaponId];
        weapon.attempts++;
        if (wasSuccessful) {
            weapon.success++;
        }
        weapon.lastUsed = Date.now();
    }
    
    // 動的クールダウン計算（改善版）
    calculateDynamicCooldown() {
        const baseCooldown = 200; // 基本クールダウンを短縮
        const difficultyMultiplier = this.difficulty === 'expert' ? 0.5 : 
                                   this.difficulty === 'hard' ? 0.6 : 
                                   this.difficulty === 'medium' ? 0.8 : 1.0;
        
        // 成功した戦術が多いほど攻撃頻度を上げる
        const successRate = this.successfulMoves.length / Math.max(1, this.successfulMoves.length + this.failedMoves.length);
        const successMultiplier = 0.3 + (successRate * 0.4); // より積極的な攻撃
        
        // 距離に基づく調整
        const distance = Math.sqrt(
            Math.pow(this.player1.x - this.player2.x, 2) +
            Math.pow(this.player1.y - this.player2.y, 2)
        );
        const distanceMultiplier = distance < 150 ? 0.5 : 1.0; // 近距離では攻撃頻度を上げる
        
        return baseCooldown * difficultyMultiplier * successMultiplier * distanceMultiplier + Math.random() * 100;
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
    
    // 高度な戦略的思考システム
    think() {
        const now = Date.now();
        
        // プレイヤー予測と学習
        this.predictPlayerMovement();
        this.learnFromPatterns();
        
        // 状態変更の判定（より頻繁に）
        if (now - this.lastStateChange > 2000) { // 2秒ごとに状態を再評価
            this.lastStateChange = now;
            this.state = this.selectOptimalStrategy();
        }
        
        // 回避タイマーが有効な場合
        if (now < this.evasionTimer) {
            this.state = 'evading';
        }
        
        // 心理戦術の実行
        this.executePsychologicalTactics();
        
        // 状態に基づく行動
        switch (this.state) {
            case 'hunting':
                this.executeHuntingStrategy();
                break;
                
            case 'evading':
                this.executeEvasionStrategy();
                break;
                
            case 'attacking':
                this.executeAttackingStrategy();
                break;
                
            case 'repositioning':
                this.executeRepositioningStrategy();
                break;
                
            case 'flanking':
                this.executeFlankingStrategy();
                break;
                
            case 'ambush':
                this.executeAmbushStrategy();
                break;
        }
        
        // 障害物回避の優先チェック（全状態で実行）
        this.checkAndAvoidObstacles();
    }
    
    // 最適戦略選択（改善版）
    selectOptimalStrategy() {
        const playerPattern = this.analyzeMovementPattern(this.patternMemory.slice(-5));
        const hpRatio = this.player2.hp / this.player1.hp;
        const distance = Math.sqrt(
            Math.pow(this.player1.x - this.player2.x, 2) +
            Math.pow(this.player1.y - this.player2.y, 2)
        );
        
        // より積極的な戦略選択
        if (this.player2.hp < 20) {
            return 'evading';
        } else if (this.player1.hp < 50) {
            return 'attacking';
        } else if (distance < 200) {
            // 近距離では積極的に攻撃
            return Math.random() > 0.3 ? 'attacking' : 'hunting';
        } else if (playerPattern.isAggressive && distance > 200) {
            return 'flanking';
        } else if (playerPattern.isDefensive && distance < 150) {
            return 'ambush';
        } else if (hpRatio < 0.6) {
            return 'repositioning';
        } else {
            // デフォルトでは狩猟戦略
            return 'hunting';
        }
    }
    
    // 狩猟戦略
    executeHuntingStrategy() {
        this.targetX = this.predictedPosition.x;
        this.targetY = Math.max(50, this.predictedPosition.y - 100);
        this.move();
        this.attack();
    }
    
    // 回避戦略
    executeEvasionStrategy() {
        this.evade();
        this.targetX = this.canvas.width / 2;
        this.targetY = 100;
        this.move();
    }
    
    // 攻撃戦略
    executeAttackingStrategy() {
        this.targetX = this.predictedPosition.x;
        this.targetY = Math.max(50, this.predictedPosition.y - 80);
        this.move();
        this.attack();
        this.attackCooldown = 200;
    }
    
    // 再配置戦略
    executeRepositioningStrategy() {
        this.targetX = this.canvas.width / 2;
        this.targetY = 150;
        this.move();
    }
    
    // 側面攻撃戦略
    executeFlankingStrategy() {
        const flankDirection = this.player1.x > this.canvas.width / 2 ? -1 : 1;
        this.targetX = this.player1.x + (flankDirection * 150);
        this.targetY = Math.max(50, this.player1.y - 120);
        this.move();
        this.attack();
    }
    
    // 待ち伏せ戦略
    executeAmbushStrategy() {
        // プレイヤーの進行方向を予測して待ち伏せ
        const ambushX = this.predictedPosition.x;
        const ambushY = Math.max(50, this.predictedPosition.y - 150);
        
        this.targetX = ambushX;
        this.targetY = ambushY;
        this.move();
        
        // 待ち伏せ位置に到達したら攻撃
        const distanceToAmbush = Math.sqrt(
            Math.pow(this.player2.x - ambushX, 2) +
            Math.pow(this.player2.y - ambushY, 2)
        );
        
        if (distanceToAmbush < 30) {
            this.attack();
        }
    }
    
    // 心理戦術の実行
    executePsychologicalTactics() {
        const now = Date.now();
        
        // ランダムな行動で予測を困難にする
        if (now - this.psychologicalTimer > 5000) {
            this.psychologicalTimer = now;
            
            // 10%の確率でランダムな行動を実行
            if (Math.random() < 0.1) {
                this.targetX = Math.random() * this.canvas.width;
                this.targetY = Math.random() * (this.canvas.height / 2);
            }
        }
        
        // 成功した戦術を繰り返す
        if (this.successfulMoves.length > 0) {
            const lastSuccessfulMove = this.successfulMoves[this.successfulMoves.length - 1];
            if (now - lastSuccessfulMove.timestamp < 10000) { // 10秒以内の成功戦術
                // 成功した戦術を優先的に実行
                this.state = lastSuccessfulMove.tactic;
            }
        }
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