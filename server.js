// --- File: server.js (Phiên bản cuối, sẵn sàng để xuất bản) ---

// --- Bước 1: Nạp các "phụ tùng" đã cài đặt ---
console.log("Bắt đầu khởi tạo server...");

// Sử dụng try-catch để bắt lỗi ngay từ đầu
try {
    const express = require('express');
    const fetch = require('node-fetch');
    const cors = require('cors'); // Thư viện để xử lý vấn đề bảo mật CORS
    require('dotenv').config(); // Nạp thư viện để đọc file .env một cách an toàn

    console.log("Tất cả thư viện đã được nạp thành công.");

    // --- Bước 2: Tạo ra máy chủ ---
    const app = express();

    // --- Bước 3: Cấu hình "giấy phép" cho máy chủ ---
    app.use(cors()); // Cho phép các trang web từ bất kỳ đâu có thể gọi đến máy chủ này
    app.use(express.json()); // Cho phép máy chủ hiểu được dữ liệu JSON được gửi lên

    // --- Bước 4: Lấy API Key đã cất giữ một cách an toàn ---
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    // Thêm một bước kiểm tra để đảm bảo API Key tồn tại
    if (!GEMINI_API_KEY) {
        console.error("!!! LỖI NGHIÊM TRỌNG: Biến môi trường GEMINI_API_KEY chưa được thiết lập.");
        // Dừng ứng dụng nếu không có key, để tránh chạy trong trạng thái lỗi
        process.exit(1); 
    } else {
        console.log("API Key đã được nạp thành công.");
    }

    // --- Bước 5: Tạo ra một "cánh cửa" để website của bạn có thể vào ---
    // Khi website gọi đến địa chỉ '/api/import-patients', đoạn mã bên trong sẽ chạy
    app.post('/api/import-patients', async (req, res) => {
        console.log("Đã nhận được yêu cầu tại /api/import-patients...");

        try {
            // Lấy dữ liệu thô mà website gửi lên
            const { rawData } = req.body;
            if (!rawData) {
                return res.status(400).json({ message: "Dữ liệu đầu vào không được để trống." });
            }

            // Đây là "mệnh lệnh" chúng ta gửi cho Gemini
            const prompt = `Bạn là một trợ lý phân tích dữ liệu y tế. Nhiệm vụ của bạn là chuyển đổi dữ liệu văn bản thô thành một mảng JSON có cấu trúc gồm các đối tượng bệnh nhân.

            QUY TẮC PHÂN TÍCH:
            - Mỗi dòng đại diện cho một bệnh nhân.
            - Các trường cần trích xuất: 'subject', 'name', 'yearOfBirth', 'phone', 'lastExamDate', 'revisitDays', 'notes'.
            - 'subject': Chỉ điền nếu có mã (ví dụ THAA, DTDB) đứng TRƯỚC tên. Nếu không, để null.
            - 'yearOfBirth': Chỉ điền nếu có số 4 chữ số nằm GIỮA tên và ngày khám. Nếu không, để null.
            - Diễn giải thời gian: '2 tuần' -> 14, '1 tháng' -> 30.
            - Đầu ra PHẢI là một mảng JSON hợp lệ.

            Dữ liệu văn bản thô:
            "${rawData}"`;

            const payload = {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                "subject": { "type": "STRING" },
                                "name": { "type": "STRING" },
                                "yearOfBirth": { "type": "NUMBER" },
                                "phone": { "type": "STRING" },
                                "lastExamDate": { "type": "STRING" },
                                "revisitDays": { "type": "NUMBER" },
                                "notes": { "type": "STRING" }
                            },
                            "required": ["name", "lastExamDate"]
                        }
                    }
                }
            };

            const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;

            const geminiResponse = await fetch(geminiApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!geminiResponse.ok) {
                const errorText = await geminiResponse.text();
                console.error("Lỗi từ Gemini API:", errorText);
                throw new Error(`Lỗi từ Gemini API: ${geminiResponse.statusText}`);
            }

            const result = await geminiResponse.json();
            const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
            
            console.log("Đã xử lý xong, gửi kết quả về frontend.");
            res.status(200).json(JSON.parse(jsonText));

        } catch (error) {
            console.error('Lỗi trong quá trình xử lý yêu cầu:', error);
            res.status(500).json({ message: 'Đã có lỗi xảy ra phía máy chủ' });
        }
    });

    // --- Bước 6: Khởi động máy chủ ---
    const PORT = process.env.PORT || 3000; // Render sẽ tự cung cấp PORT
    app.listen(PORT, () => {
        console.log(`>>> Máy chủ trung gian đang lắng nghe tại cổng ${PORT}`);
    });

} catch (e) {
    console.error("!!! Đã xảy ra lỗi nghiêm trọng khi khởi tạo server. Vui lòng kiểm tra lại các thư viện đã cài đặt.");
    console.error(e);
}

