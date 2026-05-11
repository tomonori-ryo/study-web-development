// AI対戦用の高度なAIシステム
// 難易度: 認知(decision) / 判断(evade) / 運動(aim) / 射撃(fire) を分離
const AI_DIFFICULTY_PROFILES = {
    easy: {
        decisionMinMs: 620,
        decisionMaxMs: 1500,
        threatLaneHalfWidth: 12,
        maxThreatsConsidered: 1,
        evadeAwareness: 0.12,
        evadeCommitMinMs: 140,
        evadeCommitMaxMs: 280,
        aimOffsetRange: 140,
        fireIntentProbability: 0.18,
        predictionBlend: 0.08,
        idleDriftAmplitude: 95,
        fireCooldownMult: 2.25,
        confidenceCap: 0.32,
        attackPickProbability: 0.18,
        lowHpEvadeChance: 0.15,
        simpleWeaponBias: 0.78,
    },
    medium: {
        decisionMinMs: 260,
        decisionMaxMs: 520,
        threatLaneHalfWidth: 34,
        maxThreatsConsidered: 2,
        evadeAwareness: 0.58,
        evadeCommitMinMs: 180,
        evadeCommitMaxMs: 400,
        aimOffsetRange: 48,
        fireIntentProbability: 0.62,
        predictionBlend: 0.55,
        idleDriftAmplitude: 40,
        fireCooldownMult: 1.1,
    },
    hard: {
        decisionMinMs: 180,
        decisionMaxMs: 380,
        threatLaneHalfWidth: 48,
        maxThreatsConsidered: 3,
        evadeAwareness: 0.72,
        evadeCommitMinMs: 140,
        evadeCommitMaxMs: 320,
        aimOffsetRange: 32,
        fireIntentProbability: 0.78,
        predictionBlend: 0.72,
        idleDriftAmplitude: 28,
        fireCooldownMult: 0.92,
    },
    expert: {
        decisionMinMs: 120,
        decisionMaxMs: 260,
        threatLaneHalfWidth: 58,
        maxThreatsConsidered: 4,
        evadeAwareness: 0.88,
        evadeCommitMinMs: 100,
        evadeCommitMaxMs: 240,
        aimOffsetRange: 18,
        fireIntentProbability: 0.9,
        predictionBlend: 0.88,
        idleDriftAmplitude: 16,
        fireCooldownMult: 0.78,
    },
};

class AIOpponent {
    constructor(player2, player1, canvas, obstacles, weapons, difficulty) {
        this.player2 = player2;
        this.player1 = player1;
        this.canvas = canvas;
        this.obstacles = obstacles;
        this.weapons = weapons;

        const diffKey = ['easy', 'medium', 'hard', 'expert'].includes(difficulty)
            ? difficulty
            : 'hard';
        this.difficulty = diffKey;
        this.profile = AI_DIFFICULTY_PROFILES[diffKey] || AI_DIFFICULTY_PROFILES.hard;
        
        // FSM: idle | attack | evade（割り込みは evade 優先）
        this.fsmState = 'idle';
        this.lastDecisionTime = 0;
        this.decisionInterval = this._rollDecisionInterval();
        this.evadeCommitUntil = 0;
        this.aimOffsetX = 0;
        
        // AIの状態管理（学習・ログ用レガシー名を同期）
        this.state = 'hunting';
        this.lastStateChange = Date.now();
        this.targetX = player1.x;
        this.targetY = player1.y;
        this.lastAttackTime = 0;
        this.attackCooldown = 500;
        this.evasionTimer = 0;
        this.verticalMovementTimer = 0;
        this.verticalDirection = 1; // 1: 上向き, -1: 下向き
        
        // 高度なAI機能（easy は上で上書き）
        this.predictionAccuracy = this.predictionAccuracy != null ? this.predictionAccuracy : 0.8;
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
        
        // 精度向上のための追加機能
        this.accuracyStats = {
            hitRate: 0,
            totalShots: 0,
            successfulPredictions: 0,
            totalPredictions: 0,
            averageReactionTime: 0,
            reactionTimes: []
        };
        if (diffKey === 'easy') {
            this.accuracyStats.predictionAccuracy = 0.26;
        }
        // 高度な予測システム
        this.advancedPrediction = {
            velocityHistory: [],
            accelerationHistory: [],
            patternWeights: [0.3, 0.25, 0.2, 0.15, 0.1], // 最近のパターンほど重みが高い
            predictionHorizon: 5, // 5フレーム先まで予測
            confidenceThreshold: 0.7
        };
        // リアルタイム学習システム
        this.realTimeLearning = {
            adaptationRate: 0.2,
            patternRecognition: new Map(),
            counterStrategy: new Map(),
            successThreshold: 0.6
        };
    }

    _rollDecisionInterval() {
        const p = this.profile;
        const span = Math.max(40, p.decisionMaxMs - p.decisionMinMs);
        return p.decisionMinMs + Math.random() * span;
    }

    _syncLegacyStateFromFsm() {
        if (this.fsmState === 'attack') this.state = 'attacking';
        else if (this.fsmState === 'evade') this.state = 'evading';
        else this.state = 'hunting';
    }

    /** 自陣に向かう player1 の弾（上向き）を脅威として列挙（上から近い順） */
    getThreateningBullets() {
        const lane = this.profile.threatLaneHalfWidth;
        const mid = this.player2.x + this.player2.width / 2;
        const myBottom = this.player2.y + this.player2.height;
        const bullets = this.player1.bullets || [];
        return bullets
            .filter(bullet => {
                if (bullet.y >= this.canvas.height / 2) return false;
                if (bullet.y > myBottom + 30) return false;
                if (typeof bullet.speedY === 'number' && bullet.speedY >= 0) return false;
                const bx = bullet.x + (bullet.width || 4) / 2;
                return Math.abs(bx - mid) < lane + (bullet.width || 4);
            })
            .sort((a, b) => a.y - b.y);
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
        const currentVelocity = {
            x: this.player1.x - this.lastPlayerPosition.x,
            y: this.player1.y - this.lastPlayerPosition.y
        };
        this.advancedPrediction.velocityHistory.push({
            time: currentTime,
            velocity: currentVelocity
        });
        if (this.advancedPrediction.velocityHistory.length > 20) {
            this.advancedPrediction.velocityHistory.shift();
        }
        if (this.advancedPrediction.velocityHistory.length >= 2) {
            const prevVelocity = this.advancedPrediction.velocityHistory[this.advancedPrediction.velocityHistory.length - 2].velocity;
            const acceleration = {
                x: currentVelocity.x - prevVelocity.x,
                y: currentVelocity.y - prevVelocity.y
            };
            this.advancedPrediction.accelerationHistory.push(acceleration);
            if (this.advancedPrediction.accelerationHistory.length > 10) {
                this.advancedPrediction.accelerationHistory.shift();
            }
        }
        const weightedVelocity = this.calculateWeightedVelocity();
        const predictionTime = 0.5;
        const averageAcceleration = this.calculateAverageAcceleration();
        this.predictedPosition.x = this.player1.x + (weightedVelocity.x * predictionTime) + (0.5 * averageAcceleration.x * predictionTime * predictionTime);
        this.predictedPosition.y = this.player1.y + (weightedVelocity.y * predictionTime) + (0.5 * averageAcceleration.y * predictionTime * predictionTime);
        this.patternMemory.push({
            time: currentTime,
            position: { x: this.player1.x, y: this.player1.y },
            velocity: currentVelocity,
            predictedPosition: { ...this.predictedPosition },
            state: this.state
        });
        if (this.patternMemory.length > 100) {
            this.patternMemory.shift();
        }
        this.lastPlayerPosition = { x: this.player1.x, y: this.player1.y };
        this.updatePredictionAccuracy();
    }
    
    // パターン学習システム
    learnFromPatterns() {
        if (this.patternMemory.length < 10) return;
        const recentPatterns = this.patternMemory.slice(-10);
        const movementPattern = this.analyzeMovementPattern(recentPatterns);
        const patternKey = this.generatePatternKey(movementPattern);
        if (!this.realTimeLearning.patternRecognition.has(patternKey)) {
            this.realTimeLearning.patternRecognition.set(patternKey, {
                count: 0,
                successRate: 0,
                bestCounter: null
            });
        }
        const patternData = this.realTimeLearning.patternRecognition.get(patternKey);
        patternData.count++;
        if (this.state === 'attacking' && this.lastAttackTime > 0) {
            const timeSinceLastAttack = Date.now() - this.lastAttackTime;
            if (timeSinceLastAttack < 1000) {
                this.successfulMoves.push({
                    pattern: movementPattern,
                    tactic: this.state,
                    timestamp: Date.now()
                });
                patternData.successRate = (patternData.successRate * (patternData.count - 1) + 1) / patternData.count;
            }
        }
        if (this.player2.hp < this.player1.hp) {
            this.failedMoves.push({
                pattern: movementPattern,
                tactic: this.state,
                timestamp: Date.now()
            });
            patternData.successRate = (patternData.successRate * (patternData.count - 1) + 0) / patternData.count;
        }
        this.learnOptimalCounterStrategy(patternKey, movementPattern);
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
    
    // 高度な攻撃システム（精度向上版）
    attack() {
        const now = Date.now();
        if (now - this.lastAttackTime < this.attackCooldown) return;
        if (this.profile && this.fsmState === 'attack' && Math.random() > this.profile.fireIntentProbability) {
            return;
        }
        const blend = this.profile ? this.profile.predictionBlend : 1;
        const ppx = this.predictedPosition.x * blend + this.player1.x * (1 - blend);
        const ppy = this.predictedPosition.y * blend + this.player1.y * (1 - blend);
        // プレイヤーとの距離を計算
        const dx = this.player1.x - this.player2.x;
        const dy = this.player1.y - this.player2.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        // 予測位置での攻撃（難易度ブレンド）
        const predictedDx = ppx - this.player2.x;
        const predictedDy = ppy - this.player2.y;
        const predictedDistance = Math.sqrt(predictedDx * predictedDx + predictedDy * predictedDy);
        // 精度に基づく攻撃条件の調整（やさしいは上限で頭打ち）
        let confidence = this.accuracyStats.predictionAccuracy || 0.5;
        if (this.profile && typeof this.profile.confidenceCap === 'number') {
            confidence = Math.min(confidence, this.profile.confidenceCap);
        }
        const baseAttackRange = 400;
        const adjustedAttackRange = baseAttackRange * (0.8 + confidence * 0.4); // 精度に応じて攻撃範囲を調整
        // 攻撃条件を精度に応じて調整
        const canAttack = (predictedDistance < adjustedAttackRange && Math.abs(predictedDx) < 150 * confidence) || 
                         (distance < 350 && Math.abs(dx) < 120);
        if (canAttack) {
            // 高度な武器選択（精度を考慮）
            let weaponChoice = this.selectOptimalWeaponWithAccuracy(Math.min(predictedDistance, distance), confidence);
            const bias = this.profile && this.profile.simpleWeaponBias;
            if (typeof bias === 'number' && weaponChoice > 2 && Math.random() < bias) {
                weaponChoice = 1;
            }
            const weapon = this.weapons[weaponChoice];
            if (this.player2.ammo >= weapon.ammoCost) {
                // 精度に基づく予測攻撃
                this.executePrecisionAttack(weapon, predictedDx, predictedDy, confidence);
                this.lastAttackTime = now;
                this.updateWeaponPreference(weaponChoice, true);
                this.attackCooldown = this.calculateDynamicCooldown();
                // 攻撃成功の記録
                this.recordSuccessfulAttack();
                // 精度統計を更新
                this.accuracyStats.totalShots++;
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
    
    // 精度を考慮した武器選択
    selectOptimalWeaponWithAccuracy(distance, confidence) {
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
            // 精度に基づく調整
            const accuracyMultiplier = 0.5 + confidence * 0.5;
            weaponScores[weaponId] = baseScore * successRate * accuracyMultiplier * (1 + timeSinceLastUse / 10000);
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
    // 精度に基づく予測攻撃
    executePrecisionAttack(weapon, predictedDx, predictedDy, confidence) {
        // 精度に基づく予測調整
        const adjustedDx = predictedDx * confidence;
        const adjustedDy = predictedDy * confidence;
        // 予測位置に向けて攻撃
        const angle = Math.atan2(adjustedDy, adjustedDx);
        for (let i = 0; i < weapon.bulletCount; i++) {
            const spread = (i - (weapon.bulletCount - 1) / 2) * weapon.spread * (1 - confidence * 0.5); // 精度が高いほど散弾を狭める
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
                                   this.difficulty === 'medium' ? 0.8 : 
                                   this.difficulty === 'easy' ? 1.55 : 1.0;
        
        // 成功した戦術が多いほど攻撃頻度を上げる
        const successRate = this.successfulMoves.length / Math.max(1, this.successfulMoves.length + this.failedMoves.length);
        const successMultiplier = 0.3 + (successRate * 0.4); // より積極的な攻撃
        
        // 距離に基づく調整
        const distance = Math.sqrt(
            Math.pow(this.player1.x - this.player2.x, 2) +
            Math.pow(this.player1.y - this.player2.y, 2)
        );
        const distanceMultiplier = distance < 150 ? 0.5 : 1.0; // 近距離では攻撃頻度を上げる
        
        const profileMult = this.profile && this.profile.fireCooldownMult != null ? this.profile.fireCooldownMult : 1;
        return (baseCooldown * difficultyMultiplier * successMultiplier * distanceMultiplier + Math.random() * 100) * profileMult;
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
            const now = Date.now();
            this.fsmState = 'evade';
            this.evadeCommitUntil = now + 700;
            this.evadeSteerSign = Math.random() < 0.5 ? 1 : -1;
            this.state = 'evading';
            this.evasionTimer = now + 2000;
            this._syncLegacyStateFromFsm();
        }
    }

    /**
     * FSM の状態遷移（間欠思考 + 弾脅威の割り込み）
     * Priority: EVADE（脅威・コミット） > 意思決定インターバルでの ATTACK / IDLE
     */
    thinkFSM(now) {
        const threats = this.getThreateningBullets();
        const p = this.profile;

        if (threats.length > 0) {
            let n = 0;
            for (let i = 0; i < threats.length; i++) {
                if (n >= p.maxThreatsConsidered) break;
                n++;
                if (Math.random() < p.evadeAwareness) {
                    this.fsmState = 'evade';
                    const bx = threats[i].x + (threats[i].width || 4) / 2;
                    const mid = this.player2.x + this.player2.width / 2;
                    this.evadeSteerSign = bx < mid ? 1 : -1;
                    const span = Math.max(40, p.evadeCommitMaxMs - p.evadeCommitMinMs);
                    this.evadeCommitUntil = now + p.evadeCommitMinMs + Math.random() * span;
                    this._syncLegacyStateFromFsm();
                    return;
                }
            }
        }

        if (now < this.evadeCommitUntil) {
            this.fsmState = 'evade';
            this._syncLegacyStateFromFsm();
            return;
        }

        if (now - this.lastDecisionTime < this.decisionInterval) {
            this._syncLegacyStateFromFsm();
            return;
        }

        this.lastDecisionTime = now;
        this.decisionInterval = this._rollDecisionInterval();
        this.learnFromPatterns();

        const lowHpEvadeChance = p.lowHpEvadeChance != null ? p.lowHpEvadeChance : 0.45;
        if (this.player2.hp < 22 && threats.length > 0 && Math.random() < lowHpEvadeChance) {
            this.fsmState = 'evade';
            const span = Math.max(40, p.evadeCommitMaxMs - p.evadeCommitMinMs);
            this.evadeCommitUntil = now + p.evadeCommitMinMs + Math.random() * span;
            this.evadeSteerSign = Math.random() < 0.5 ? 1 : -1;
            this._syncLegacyStateFromFsm();
            return;
        }

        this.aimOffsetX = (Math.random() * 2 - 1) * p.aimOffsetRange;

        let minWeaponCost = 1;
        Object.keys(this.weapons).forEach(k => {
            const w = this.weapons[k];
            if (w && typeof w.ammoCost === 'number') {
                minWeaponCost = Math.min(minWeaponCost, w.ammoCost);
            }
        });
        const hasAmmo = this.player2.ammo >= minWeaponCost;
        const dxAlign = Math.abs(this.player1.x - this.player2.x);

        const attackPickProbability = p.attackPickProbability != null ? p.attackPickProbability : 0.38;
        if (hasAmmo && (dxAlign < 95 + p.threatLaneHalfWidth || Math.random() < attackPickProbability)) {
            this.fsmState = 'attack';
        } else {
            this.fsmState = 'idle';
        }
        this.lastStateChange = now;
        this._syncLegacyStateFromFsm();
    }

    /** 現在の FSM 状態に応じた毎フレームの移動・攻撃 */
    executeFSMState() {
        const p = this.profile;
        switch (this.fsmState) {
            case 'evade': {
                const threats = this.getThreateningBullets();
                let sign = this.evadeSteerSign || 1;
                if (threats.length > 0) {
                    const bx = threats[0].x + (threats[0].width || 4) / 2;
                    const mid = this.player2.x + this.player2.width / 2;
                    sign = bx < mid ? 1 : -1;
                }
                this.targetX = this.player2.x + sign * this.player2.speed * 3;
                const minY = 0;
                const maxY = this.canvas.height / 2 - this.player2.height;
                this.targetY = Math.max(minY + 8, Math.min(maxY, this.player2.y + (Math.random() - 0.5) * this.player2.speed));
                this.move();
                break;
            }
            case 'attack': {
                const b = p.predictionBlend;
                this.targetX = this.predictedPosition.x * b + this.player1.x * (1 - b) + this.aimOffsetX;
                this.targetY = Math.max(50, this.predictedPosition.y * b + this.player1.y * (1 - b) - 80);
                this.move();
                this.attack();
                break;
            }
            default: {
                const t = Date.now() * 0.002;
                this.targetX = this.canvas.width / 2 + Math.sin(t) * p.idleDriftAmplitude;
                this.targetY = Math.max(45, this.predictedPosition.y - 90);
                this.move();
                break;
            }
        }
    }
    
    // 最適戦略選択（精度向上版）
    selectOptimalStrategy() {
        const playerPattern = this.analyzeMovementPattern(this.patternMemory.slice(-5));
        const hpRatio = this.player2.hp / this.player1.hp;
        const distance = Math.sqrt(
            Math.pow(this.player1.x - this.player2.x, 2) +
            Math.pow(this.player1.y - this.player2.y, 2)
        );
        // パターン認識に基づく戦略選択
        const patternKey = this.generatePatternKey(playerPattern);
        const patternData = this.realTimeLearning.patternRecognition.get(patternKey);
        const bestCounter = patternData?.bestCounter;
        // 精度に基づく戦略調整
        const confidence = this.accuracyStats.predictionAccuracy || 0.5;
        // より積極的な戦略選択（精度が高いほど積極的）
        if (this.player2.hp < 20) {
            return 'evading';
        } else if (this.player1.hp < 50) {
            return 'attacking';
        } else if (distance < 200) {
            // 近距離では積極的に攻撃（精度に応じて調整）
            const attackProbability = 0.3 + confidence * 0.4;
            return Math.random() > attackProbability ? 'attacking' : 'hunting';
        } else if (bestCounter && confidence > 0.6) {
            // 学習した最適な対抗戦略を使用
            return bestCounter;
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
    
    // AIの実行（予測は毎フレーム、状態遷移は間欠 + 脅威割り込み）
    execute() {
        const now = Date.now();
        this.predictPlayerMovement();
        this.thinkFSM(now);
        this.executeFSMState();
        this.checkAndAvoidObstacles();
    }

    // --- 高度な予測システム ---
    calculateWeightedVelocity() {
        if (this.advancedPrediction.velocityHistory.length === 0) {
            return { x: 0, y: 0 };
        }
        let weightedSumX = 0;
        let weightedSumY = 0;
        let totalWeight = 0;
        const weights = this.advancedPrediction.patternWeights;
        const recentVelocities = this.advancedPrediction.velocityHistory.slice(-weights.length);
        recentVelocities.forEach((entry, index) => {
            const weight = weights[index] || 0.1;
            weightedSumX += entry.velocity.x * weight;
            weightedSumY += entry.velocity.y * weight;
            totalWeight += weight;
        });
        return {
            x: weightedSumX / totalWeight,
            y: weightedSumY / totalWeight
        };
    }
    calculateAverageAcceleration() {
        if (this.advancedPrediction.accelerationHistory.length === 0) {
            return { x: 0, y: 0 };
        }
        const sumX = this.advancedPrediction.accelerationHistory.reduce((sum, acc) => sum + acc.x, 0);
        const sumY = this.advancedPrediction.accelerationHistory.reduce((sum, acc) => sum + acc.y, 0);
        const count = this.advancedPrediction.accelerationHistory.length;
        return {
            x: sumX / count,
            y: sumY / count
        };
    }
    updatePredictionAccuracy() {
        if (this.patternMemory.length < 2) return;
        const lastPrediction = this.patternMemory[this.patternMemory.length - 2];
        const actualPosition = this.patternMemory[this.patternMemory.length - 1].position;
        if (lastPrediction.predictedPosition) {
            const predictionError = Math.sqrt(
                Math.pow(actualPosition.x - lastPrediction.predictedPosition.x, 2) +
                Math.pow(actualPosition.y - lastPrediction.predictedPosition.y, 2)
            );
            this.accuracyStats.totalPredictions++;
            if (predictionError < 30) {
                this.accuracyStats.successfulPredictions++;
            }
            this.accuracyStats.predictionAccuracy = 
                this.accuracyStats.successfulPredictions / this.accuracyStats.totalPredictions;
        }
    }
    // --- リアルタイム学習システム ---
    generatePatternKey(pattern) {
        return `${pattern.isAggressive ? 'A' : 'D'}_${pattern.horizontalTendency > 3 ? 'H' : 'L'}_${pattern.verticalTendency > 2 ? 'V' : 'S'}`;
    }
    learnOptimalCounterStrategy(patternKey, pattern) {
        const currentTactic = this.state;
        const successRate = this.realTimeLearning.patternRecognition.get(patternKey)?.successRate || 0;
        if (!this.realTimeLearning.counterStrategy.has(patternKey)) {
            this.realTimeLearning.counterStrategy.set(patternKey, new Map());
        }
        const counterMap = this.realTimeLearning.counterStrategy.get(patternKey);
        if (!counterMap.has(currentTactic)) {
            counterMap.set(currentTactic, { success: 0, attempts: 0 });
        }
        const tacticData = counterMap.get(currentTactic);
        tacticData.attempts++;
        if (this.player2.hp >= this.player1.hp) {
            tacticData.success++;
        }
        let bestTactic = currentTactic;
        let bestSuccessRate = 0;
        counterMap.forEach((data, tactic) => {
            const successRate = data.attempts > 0 ? data.success / data.attempts : 0;
            if (successRate > bestSuccessRate) {
                bestSuccessRate = successRate;
                bestTactic = tactic;
            }
        });
        this.realTimeLearning.patternRecognition.get(patternKey).bestCounter = bestTactic;
    }
    
}

// グローバルにエクスポート
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIOpponent;
} else {
    window.AIOpponent = AIOpponent;
} 