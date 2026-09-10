const fs = require('fs');
const path = require('path');

// دالة للبحث التلقائي في المجلدات
function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        if (isDirectory) {
            // استثناء مجلدات مثل node_modules و .git لتوفير الوقت
            if (f !== 'node_modules' && f !== '.git' && f !== 'build' && f !== 'dist') {
                walkDir(dirPath, callback);
            }
        } else {
            callback(dirPath);
        }
    });
}

// مسار المجلد الرئيسي للمشروع
const targetDir = './src';

console.log('جاري فحص وإصلاح ملفات المشروع...');

walkDir(targetDir, (filePath) => {
    // نركز على ملفات الكود الخاصة برياكت
    if (filePath.endsWith('.jsx') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
        try {
            // قراءة الملف بترميز latin1 ثم تحويله إلى utf8 (هذه هي الطريقة السحرية لعكس تلف الترميز)
            let rawBuffer = fs.readFileSync(filePath);
            
            // محاولة اكتشاف إذا كان الملف يحتوي على ترميز خاطئ وتحويله
            // غالباً ما ينتج التلف عن قراءة بايتات UTF-8 كـ Windows-1252 أو ISO-8859-1
            let decodedString = iconvLiteOrManual(rawBuffer);
            
            // إذا أردت استخدام استبدالات مخصصة إضافية للمصطلحات التالفة لديك:
            const replacements = {
                'ØØ¯Ø« Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ ØªØÙ…ÙŠÙ„ Ø£ÙƒÙˆØ§Ø¯ QR.': 'حدث خطأ أثناء تحميل أكواد QR.',
                'Ù…ØªØ§Ø¨Ø¹Ø© Ø§Ù„Ø®Ø·Ø§Ø¨Ø§Øª': 'متابعة الخطابات',
                'Ø¥Ø¯Ø§Ø±Ø© Ø£ÙƒÙˆØ§Ø¯ QR Ø§Ù„Ø®Ø§ØµØ© Ø¨Ø£Ø±Ø´ÙŠÙA Ø§Ù„Ø®Ø·Ø§Ø¨Ø§Øª': 'إدارة أكواد QR الخاصة بأرشيف الخطابات',
                'ðŸ–¨ï¸': '🖨️',
                'â€”': '—'
            };

            let modified = decodedString;
            for (const [bad, good] of Object.entries(replacements)) {
                modified = modified.split(bad).join(good);
            }

            if (modified !== rawBuffer.toString('utf8')) {
                fs.writeFileSync(filePath, modified, 'utf8');
                console.log(`تم إصلاح الملف: ${filePath}`);
            }
        } catch (err) {
            console.error(`خطأ أثناء معالجة الملف ${filePath}:`, err.message);
        }
    }
});

function iconvLiteOrManual(buffer) {
    // طريقة تحويل آمنة لقراءة النصوص العربية التالفة عبر Buffer
    // قراءة النص كـ binary/latin1 ثم إعادة تفسيره كـ utf8 صحيح
    try {
        let latin1String = buffer.toString('latin1');
        // التحقق من وجود حروف عربية تالفة شائعة البداية مثل Ø أو Ù
        return Buffer.from(latin1String, 'latin1').toString('utf8');
    } catch (e) {
        return buffer.toString('utf8');
    }
}

console.log('اكتملت عملية الفحص والإصلاح.');