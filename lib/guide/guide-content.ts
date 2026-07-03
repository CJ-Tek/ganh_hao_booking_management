import type { Role } from "@/lib/types";
import { APP_USER_ROLE_LABEL } from "@/lib/app-user-display";
import type { GuideModuleContent, GuideModuleId } from "./types";

const ALL_ROLES: Role[] = ["admin", "general_manager", "manager", "employee"];

function roleLabel(role: Role): string {
  return APP_USER_ROLE_LABEL[role];
}

function bookingsContent(role: Role): GuideModuleContent {
  if (role === "employee") {
    return {
      intro:
        "Nhân viên sử dụng màn Đặt bàn để theo dõi suất trong ngày và đánh dấu hoàn thành khi khách đã ngồi xong.",
      steps: [
        {
          title: "Mở màn Đặt bàn",
          body: "Sau đăng nhập, bạn vào thẳng màn Đặt bàn. Đây là màn hình chính của bạn.",
        },
        {
          title: "Xem booking hôm nay",
          body: "Tab Booking hôm nay liệt kê các suất trong ngày. Dùng bộ lọc trạng thái để tìm khách sắp đến hoặc đang ngồi.",
        },
        {
          title: "Đánh dấu Hoàn thành",
          body: "Khi khách đã vào bàn và bàn đang ở trạng thái Đã ngồi, bạn có thể nhấn Hoàn thành để kết thúc phục vụ và giải phóng bàn.",
        },
        {
          title: "Những việc bạn không làm được",
          body: "Tài khoản nhân viên không tạo booking mới, không sửa thông tin booking và không chỉnh sơ đồ. Nếu cần hỗ trợ, liên hệ quản lý ca.",
        },
      ],
      tips: [
        "Luôn kiểm tra trạng thái bàn trước khi nhấn Hoàn thành.",
        "Nếu không thấy nút Hoàn thành, booking có thể chưa check-in hoặc bàn chưa ở trạng thái Đã ngồi.",
      ],
    };
  }

  return {
    intro:
      "Màn Đặt bàn giúp bạn quản lý toàn bộ booking của chi nhánh: xem suất hôm nay, tra cứu lịch sử và thao tác nhanh check-in, đổi bàn, hoàn thành.",
    steps: [
      {
        title: "Mở màn Đặt bàn",
        body: "Chọn Đặt bàn trên menu trái hoặc thanh dưới (trên điện thoại).",
      },
      {
        title: "Tab Booking hôm nay",
        body: "Tập trung suất trong ngày. Lọc theo trạng thái và loại khách. Thao tác nhanh: Check-in, Chờ, Gán bàn, Đổi bàn, Hoàn thành, Hủy.",
      },
      {
        title: "Tab Danh sách booking",
        body: "Xem mọi booking theo khoảng ngày, tìm kiếm theo tên hoặc SĐT, sửa thông tin và xuất Excel.",
      },
      {
        title: "Tạo booking mới",
        body: "Nhấn nút Tạo booking trên thanh công cụ. Điền thông tin khách, chọn giờ đến và bàn (có thể gán sau).",
      },
      {
        title: "Xử lý trùng lịch",
        body: "Khi trùng SĐT hoặc trùng khung giờ trên một bàn, hệ thống cảnh báo để bạn kiểm tra trước khi lưu.",
      },
    ],
    tips: [
      "Dùng Booking hôm nay cho ca hiện tại; Danh sách booking cho tra cứu và báo cáo.",
      "Sau khi tạo booking, bạn có thể mở Sơ đồ để xếp bàn trực quan.",
    ],
  };
}

function bookingFlowContent(role: Role): GuideModuleContent {
  if (role === "employee") {
    return {
      intro:
        "Nhân viên dùng màn Đặt bàn để theo dõi suất trong ngày và hỗ trợ kết thúc phục vụ khi khách đã ngồi. Tạo hoặc sửa booking do quản lý ca thực hiện.",
      steps: [
        {
          title: "Mở màn Đặt bàn",
          body: "Sau đăng nhập, bạn vào thẳng Đặt bàn. Đây là màn hình chính của tài khoản nhân viên.",
        },
        {
          title: "Tab Booking hôm nay",
          body: "Xem danh sách suất trong ngày. Dùng bộ lọc trạng thái để tìm khách sắp đến (Chờ đến), đã xác nhận, hoặc đang ngồi.",
        },
        {
          title: "Mở chi tiết một booking",
          body: "Nhấn vào dòng booking để xem giờ đến, số khách, bàn, ghi chú và trạng thái hiện tại.",
        },
        {
          title: "Khi khách đến",
          body: "Nếu khách hỏi về bàn đã đặt, tìm booking theo tên hoặc SĐT. Báo quản lý ca để check-in hoặc xếp bàn nếu cần — nhân viên không tự tạo/sửa booking.",
        },
        {
          title: "Đánh dấu Hoàn thành",
          body: "Khi khách đã vào bàn và bàn ở trạng thái Đã ngồi, nhấn Hoàn thành để kết thúc phục vụ và giải phóng bàn.",
        },
        {
          title: "Khi không thấy nút Hoàn thành",
          body: "Booking có thể chưa check-in hoặc bàn chưa chuyển Đã ngồi. Nhờ quản lý ca xử lý trước khi bạn nhấn Hoàn thành.",
        },
        {
          title: "Khách muốn đặt bàn mới",
          body: "Chuyển cho quản lý chi nhánh hoặc nhân sự có quyền tạo booking. Bạn có thể ghi chú nhanh: tên, SĐT, số khách, giờ đến để họ nhập vào hệ thống.",
        },
      ],
      tips: [
        "Luôn đọc Ghi chú trên booking — có thể có yêu cầu đặc biệt (sinh nhật, đoàn, đặt món trước…).",
        "Kiểm tra đúng booking trước khi nhấn Hoàn thành, tránh nhầm khách.",
      ],
    };
  }

  return {
    intro:
      "Hướng dẫn đầy đủ quy trình đặt bàn: từ lúc nhận yêu cầu của khách, tạo booking, xếp bàn, check-in, cho đến khi hoàn thành hoặc hủy.",
    steps: [
      {
        title: "Bước 0 — Kiểm tra chi nhánh",
        body: "Trên thanh công cụ, xác nhận đúng chi nhánh đang làm việc. Mọi booking bạn tạo đều gắn với chi nhánh hiện tại.",
      },
      {
        title: "Bước 1 — Chọn cách tạo booking",
        body: "Có 3 cách phổ biến: (1) Nút Tạo booking trên thanh công cụ, (2) Chọn bàn trên Sơ đồ rồi tạo booking, (3) Đặt bàn bằng giọng nói (micro trên form) rồi kiểm tra và lưu.",
      },
      {
        title: "Bước 2 — Điền thông tin khách",
        body: "Bắt buộc: tên khách và giờ đến. Nên có: số điện thoại (để tìm lại và tránh trùng), số khách, ghi chú (yêu cầu đặc biệt, đặt món trước, sinh nhật…).",
      },
      {
        title: "Bước 3 — Chọn hình thức đặt",
        body: "Giữ chỗ: khách đến sau, chọn giờ trong tương lai — bàn chuyển Giữ chỗ. Vào bàn ngay: khách có mặt tại quầy — bàn chuyển Đã ngồi, booking chuyển Đã vào bàn.",
      },
      {
        title: "Bước 4 — Gán bàn (hoặc để chờ)",
        body: "Chọn khu vực + một bàn, hoặc cụm bàn gộp. Có thể để trống bàn → booking ở trạng thái Chờ xếp bàn, gán sau bằng Gán vào bàn hoặc trên Sơ đồ.",
      },
      {
        title: "Bước 5 — Loại khách và ghi chú",
        body: "Chọn loại khách phù hợp (Khách thường, Khách quen, Đoàn, Sinh nhật, VIP, Đặt món trước…). Ghi chú rõ ràng giúp ca sau nắm yêu cầu mà không cần hỏi lại.",
      },
      {
        title: "Bước 6 — Lưu và xử lý trùng lịch",
        body: "Nhấn Lưu. Nếu trùng SĐT hoặc trùng khung giờ trên một bàn, hệ thống cảnh báo — kiểm tra booking cũ trước khi tiếp tục tạo.",
      },
      {
        title: "Bước 7 — Theo dõi trên Booking hôm nay",
        body: "Mở Đặt bàn → tab Booking hôm nay. Lọc theo trạng thái và loại khách. Trạng thái Chờ đến giúp thấy khách sắp tới trong cửa sổ giờ cho phép.",
      },
      {
        title: "Bước 8 — Khách đến đúng giờ: Check-in",
        body: "Tìm booking (Chờ đến / Đã xác nhận) → nhấn Check-in. Bàn chuyển Đã ngồi; Sơ đồ và Lịch cập nhật; có thể có thông báo nội bộ.",
      },
      {
        title: "Bước 9 — Chưa có bàn: Gán hoặc Chờ",
        body: "Booking Chờ xếp bàn → Gán vào bàn (chọn bàn trên sơ đồ) hoặc đưa vào Chờ nếu chưa xếp được ngay.",
      },
      {
        title: "Bước 10 — Khách muốn đổi bàn",
        body: "Mở booking → Đổi bàn → chọn bàn mới trên Sơ đồ, giữ nguyên giờ đến.",
      },
      {
        title: "Bước 11 — Kết thúc phục vụ",
        body: "Khi khách rời đi, mở booking đang ngồi → Hoàn thành. Bàn trống nếu không còn booking active trên bàn đó.",
      },
      {
        title: "Bước 12 — Hủy hoặc khách không đến",
        body: "Trước giờ: Hủy bàn. Quá giờ trễ (cuối ngày): có thể chuyển Không đến theo quy tắc hệ thống.",
      },
      {
        title: "Bước 13 — Sửa booking sau khi tạo",
        body: "Tab Danh sách booking: lọc theo ngày, tìm theo tên/SĐT/bàn/ghi chú → Sửa (tên, SĐT, số khách, giờ, ghi chú). Chỉ sửa được khi booking còn ở trạng thái cho phép (Chờ xếp bàn, Đã xác nhận, Trễ).",
      },
      {
        title: "Hiểu nhanh trạng thái booking",
        body: "Chờ xếp bàn = chưa có bàn. Đã xác nhận = đã có bàn/giờ, chờ khách. Chờ đến = sắp tới giờ. Đã check-in / Đã vào bàn = khách đang phục vụ. Trễ = quá giờ chưa check-in. Hoàn thành / Đã hủy / Không đến = kết thúc.",
      },
    ],
    tips: [
      "Khách gọi đặt trước: Giữ chỗ + giờ → gán bàn trên Sơ đồ (hoặc Chờ xếp bàn).",
      "Khách walk-in: Sơ đồ → bàn trống → Vào bàn ngay.",
      "Dùng giọng nói khi bận nghe điện thoại — luôn đọc lại form trước khi Lưu.",
      "Tab Danh sách booking + Xuất Excel hữu ích cho tra cứu và báo cáo.",
    ],
  };
}

function yourRoleContent(role: Role): GuideModuleContent {
  const descriptions: Record<Role, string> = {
    admin:
      "Bạn có toàn quyền hệ thống: xem mọi chi nhánh, cấu hình booking, quản lý người dùng và gán vai trò Admin.",
    general_manager:
      "Bạn giám sát nhiều chi nhánh, cấu hình hệ thống và quản lý người dùng (trừ tài khoản Admin).",
    manager:
      "Bạn vận hành chi nhánh được gán: đặt bàn, sơ đồ, lịch, khách hàng. Có thể xem chi nhánh khác ở chế độ chỉ đọc.",
    employee:
      "Bạn hỗ trợ tại quầy: theo dõi booking hôm nay và đánh dấu hoàn thành khi khách đã ngồi xong.",
  };

  const menus: Record<Role, string> = {
    admin:
      "Tổng quan, Sơ đồ, Đặt bàn, Lịch, Quản lý bàn, Khách hàng, Khu vực, Cấu hình, Chi nhánh, Người dùng, Hướng dẫn.",
    general_manager:
      "Tổng quan, Sơ đồ, Đặt bàn, Lịch, Quản lý bàn, Khách hàng, Khu vực, Cấu hình, Chi nhánh, Người dùng, Hướng dẫn.",
    manager: "Tổng quan, Sơ đồ, Đặt bàn, Lịch, Khách hàng, Hướng dẫn.",
    employee: "Đặt bàn, Hướng dẫn, Tài khoản của tôi.",
  };

  return {
    intro: `Vai trò hiện tại của bạn: ${roleLabel(role)}.`,
    steps: [
      {
        title: "Quyền của bạn",
        body: descriptions[role],
      },
      {
        title: "Menu bạn thấy",
        body: menus[role],
      },
      {
        title: "Chi nhánh làm việc",
        body:
          role === "admin" || role === "general_manager"
            ? "Sau đăng nhập, chọn chi nhánh trên màn Chọn chi nhánh hoặc đổi nhanh trên thanh công cụ."
            : "Dữ liệu hiển thị theo chi nhánh bạn được gán. Nếu được gán nhiều chi nhánh, dùng mục Chọn chi nhánh.",
      },
    ],
    tips: [
      "Nếu thiếu quyền hoặc không thấy màn hình cần dùng, liên hệ Admin hoặc Quản lý tổng.",
    ],
  };
}

function workflowsContent(role: Role): GuideModuleContent {
  if (role === "employee") {
    return {
      intro: "Các tình huống thường gặp khi làm việc tại quầy với tài khoản nhân viên.",
      steps: [
        {
          title: "Khách đang ngồi, chuẩn bị rời bàn",
          body: "Mở Đặt bàn → tìm booking → nhấn Hoàn thành khi bàn đang ở trạng thái Đã ngồi.",
        },
        {
          title: "Không thấy nút Hoàn thành",
          body: "Booking có thể chưa check-in hoặc bàn chưa chuyển Đã ngồi. Nhờ quản lý ca hỗ trợ.",
        },
        {
          title: "Cần tạo hoặc sửa booking",
          body: "Chuyển cho quản lý chi nhánh hoặc nhân viên có quyền đặt bàn.",
        },
      ],
      tips: ["Luôn xác nhận đúng booking trước khi nhấn Hoàn thành."],
    };
  }

  return {
    intro: "Các luồng làm việc phổ biến tại nhà hàng — làm theo từng bước để không bỏ sót.",
    steps: [
      {
        title: "Khách gọi đặt trước",
        body: "Tạo booking → chọn Giữ chỗ + giờ đến → gán bàn trên Sơ đồ (hoặc để Chờ xếp bàn).",
      },
      {
        title: "Khách walk-in (đến ngay)",
        body: "Sơ đồ → chọn bàn trống → Vào bàn ngay. Bàn chuyển Đã ngồi, booking chuyển Đã vào bàn.",
      },
      {
        title: "Khách đến đúng giờ hẹn",
        body: "Đặt bàn → tìm khách (Chờ đến / Đã xác nhận) → Check-in. Sơ đồ và Lịch tự cập nhật.",
      },
      {
        title: "Khách muốn đổi bàn",
        body: "Mở booking → Đổi bàn → chọn bàn mới trên Sơ đồ, giữ nguyên giờ.",
      },
      {
        title: "Kết thúc phục vụ",
        body: "Booking đang ngồi → Hoàn thành. Bàn trống nếu không còn booking active.",
      },
      {
        title: "Khách hủy hoặc không đến",
        body: "Trước giờ: Hủy bàn. Quá giờ trễ cuối ngày: có thể chuyển Không đến.",
      },
    ],
    tips: [
      "Sơ đồ phù hợp xếp bàn trực quan; Đặt bàn phù hợp thao tác hàng loạt.",
    ],
  };
}

function tipsContent(role: Role): GuideModuleContent {
  const common = [
    "Luôn kiểm tra chi nhánh trên thanh công cụ trước khi tạo booking.",
    "Theo dõi chuông thông báo để không bỏ lỡ khách sắp đến.",
  ];

  const roleTips: Record<Role, string[]> = {
    admin: [
      ...common,
      "Dùng Cấu hình Booking hôm nay để điều chỉnh ngưỡng Đoàn, Khách quen và cửa sổ Chờ đến.",
      "Lưu mẫu sơ đồ cho ngày đông khách để tiết kiệm thời gian.",
    ],
    general_manager: [
      ...common,
      "Tab Theo chi nhánh trên Tổng quan giúp so sánh hai điểm.",
      "Quản lý tổng không chỉnh tài khoản Admin — liên hệ Admin khi cần.",
    ],
    manager: [
      ...common,
      "Trên điện thoại, dùng thanh dưới (Lịch · Sơ đồ · Đặt bàn) để thao tác nhanh.",
      "Dùng giọng nói khi bận nghe điện thoại — vẫn đọc lại form trước khi lưu.",
    ],
    employee: [
      "Tập trung tab Booking hôm nay — đây là nơi bạn làm việc chính.",
      "Nếu cần tạo booking, nhờ quản lý ca thay bạn.",
      "Vào Hướng dẫn bất cứ lúc nào khi quên thao tác.",
    ],
  };

  return {
    intro: "Một vài mẹo nhỏ giúp bạn làm việc nhanh và chính xác hơn.",
    steps: roleTips[role].map((tip, index) => ({
      title: `Mẹo ${index + 1}`,
      body: tip,
    })),
    tips: [],
  };
}

const STATIC_CONTENT: Record<
  Exclude<
    GuideModuleId,
    "your-role" | "bookings" | "booking-flow" | "workflows" | "tips"
  >,
  GuideModuleContent
> = {
  start: {
    intro:
      "Chào mừng bạn đến với hệ thống quản lý đặt bàn Gành Hào. Ứng dụng giúp nhà hàng nhận đặt bàn, xếp bàn, check-in khách và theo dõi vận hành tại quầy.",
    steps: [
      {
        title: "Ứng dụng làm gì?",
        body: "Nhận đặt bàn (nhập tay hoặc giọng nói), xếp bàn trên sơ đồ, theo dõi khách đến giờ/trễ, quản lý khách hàng và nhận thông báo nội bộ.",
      },
      {
        title: "Ai dùng ứng dụng?",
        body: "Chỉ dành cho nhân sự nội bộ: Admin, Quản lý tổng, Quản lý chi nhánh và Nhân viên quầy.",
      },
      {
        title: "Bắt đầu từ đâu?",
        body: "Chọn một chủ đề bên trái (hoặc danh sách trên điện thoại) để đọc hướng dẫn từng bước. Mỗi mục có ảnh minh họa màn hình thực tế.",
      },
    ],
    tips: ["Bạn chỉ thấy các mục phù hợp với vai trò của mình."],
  },
  "login-branch": {
    intro: "Cách đăng nhập và chọn đúng chi nhánh trước khi làm việc.",
    steps: [
      {
        title: "Đăng nhập",
        body: "Mở ứng dụng → nhập tên đăng nhập và mật khẩu do quản trị cấp → nhấn Đăng nhập.",
      },
      {
        title: "Sau khi đăng nhập",
        body: "Admin / Quản lý tổng: chọn chi nhánh. Quản lý chi nhánh / Nhân viên: vào Đặt bàn (hoặc chọn chi nhánh nếu được gán nhiều nơi).",
      },
      {
        title: "Đổi chi nhánh",
        body: "Admin / Quản lý tổng đổi nhanh trên thanh công cụ. Các vai trò khác dùng mục Chọn chi nhánh trong menu khi cần.",
      },
      {
        title: "Lưu ý quan trọng",
        body: "Mọi booking, sơ đồ và thông báo đều theo chi nhánh đang chọn. Kiểm tra trước khi tạo booking mới.",
      },
    ],
    tips: ["Nếu sai mật khẩu, hệ thống báo và bạn có thể thử lại."],
  },
  interface: {
    intro: "Làm quen giao diện chung để điều hướng nhanh giữa các màn hình.",
    steps: [
      {
        title: "Menu trái",
        body: "Chứa các mục theo vai trò của bạn. Trên màn hình rộng, có thể thu gọn menu.",
      },
      {
        title: "Thanh công cụ trên",
        body: "Hiển thị logo, tên cổng, chọn chi nhánh (nếu có), làm mới dữ liệu, chuông thông báo và menu tài khoản.",
      },
      {
        title: "Tạo booking nhanh",
        body: "Nút + hoặc Tạo booking trên thanh công cụ mở form đặt bàn mới (trừ nhân viên).",
      },
      {
        title: "Thanh dưới trên điện thoại",
        body: "Quản lý và admin có thanh tác vụ: Lịch, Sơ đồ, Đặt bàn và nút + ở giữa.",
      },
      {
        title: "Tìm kiếm trên Sơ đồ",
        body: "Tra cứu bàn, booking, khách hàng. Hỗ trợ nhập bằng giọng nói qua micro trình duyệt.",
      },
    ],
    tips: ["Tên cổng trên thanh công cụ cho biết bạn đang ở chế độ quản lý hay nhân viên."],
  },
  dashboard: {
    intro: "Tổng quan giúp bạn nắm nhanh tình hình chi nhánh đang chọn.",
    steps: [
      {
        title: "Mở Tổng quan",
        body: "Chọn Tổng quan trên menu trái.",
      },
      {
        title: "Tab Tổng quan",
        body: "Xem số liệu: tổng booking, đã check-in, bàn phục vụ, bàn trống. Kèm biểu đồ phân bố bàn và booking.",
      },
      {
        title: "Tab Theo chi nhánh",
        body: "So sánh với chi nhánh khác — hữu ích cho quản lý tổng theo dõi nhiều điểm.",
      },
      {
        title: "Xem trước sơ đồ",
        body: "Bản xem trước sơ đồ bàn theo khu vực — chỉ xem, không chỉnh.",
      },
    ],
    tips: ["Nhấn Làm mới trên thanh công cụ nếu số liệu có vẻ cũ."],
  },
  "floor-map": {
    intro: "Sơ đồ là trung tâm vận hành tại quầy: xem bàn, đặt chỗ, check-in và chỉnh bố cục.",
    steps: [
      {
        title: "Chọn ngày và khu vực",
        body: "Chọn ngày xem sơ đồ và khu vực (sảnh trong, sân vườn, VIP…) để hiển thị đúng nhóm bàn.",
      },
      {
        title: "Chế độ View",
        body: "Dùng để tiếp khách: chạm bàn để xem chi tiết, tạo booking, check-in hoặc đổi trạng thái.",
      },
      {
        title: "Chế độ Edit",
        body: "Dùng để chỉnh bố cục: kéo bàn, gộp bàn, căn lưới. Chỉ một người được Edit cùng lúc cho một khu vực.",
      },
      {
        title: "Đặt bàn trên sơ đồ",
        body: "Chọn bàn → điền thông tin khách → Giữ chỗ (giờ tương lai) hoặc Vào bàn ngay (khách đến liền).",
      },
      {
        title: "Đặt bàn bằng giọng nói",
        body: "Dùng micro trên form tạo booking. Nói tự nhiên, hệ thống điền sẵn — bạn kiểm tra và xác nhận.",
      },
    ],
    tips: [
      "Phóng to/thu nhỏ bằng cuộn chuột hoặc chụm hai ngón trên điện thoại.",
      "Lưu mẫu sơ đồ cho ngày đông khách.",
    ],
  },
  calendar: {
    intro: "Lịch đặt bàn giúp xem booking theo ngày hoặc tuần — phù hợp lên kế hoạch ca.",
    steps: [
      {
        title: "Mở Lịch đặt bàn",
        body: "Chọn Lịch đặt bàn trên menu hoặc thanh dưới.",
      },
      {
        title: "Chuyển Ngày / Tuần",
        body: "Dùng điều khiển trên đầu trang để đổi chế độ xem.",
      },
      {
        title: "Lọc và xem chi tiết",
        body: "Lọc theo trạng thái booking. Nhấn vào booking để xem chi tiết, check-in hoặc đổi bàn.",
      },
    ],
    tips: ["Mọi thay đổi đồng bộ với Sơ đồ và Đặt bàn theo thời gian thực."],
  },
  tables: {
    intro: "Quản lý bàn vật lý của chi nhánh — dành cho Admin và Quản lý tổng.",
    steps: [
      {
        title: "Tab Bàn đơn",
        body: "Xem tất cả bàn theo khu vực. Thêm một bàn hoặc thêm hàng loạt (ví dụ Bàn 1–20). Sửa tên hoặc xóa bàn không dùng.",
      },
      {
        title: "Tab Bàn gộp / Bàn tách",
        body: "Xem cụm gộp và bàn tách đang hoạt động. Giải tán cụm hoặc xóa bàn tách khi hết hiệu lực.",
      },
    ],
    tips: ["Thay đổi ở đây ảnh hưởng tới Sơ đồ và khả năng gán booking."],
  },
  customers: {
    intro: "Lưu thông tin khách và lịch sử đặt bàn theo chi nhánh.",
    steps: [
      {
        title: "Tìm khách",
        body: "Tìm theo tên hoặc SĐT. Lọc: Tất cả / Có booking / Chưa có booking.",
      },
      {
        title: "Xem hồ sơ",
        body: "Nhấn vào khách để xem thông tin liên hệ và lịch sử booking. Mở từng booking để thao tác tiếp.",
      },
      {
        title: "Khách quen",
        body: "Hệ thống tự nhận Khách quen khi khách hoàn thành đủ số lần đặt (theo cấu hình).",
      },
    ],
    tips: ["Chọn nhiều khách để xóa khi không còn cần lưu."],
  },
  notifications: {
    intro: "Theo dõi sự kiện quan trọng: check-in, cập nhật booking, xung đột bàn…",
    steps: [
      {
        title: "Xem nhanh",
        body: "Nhấn chuông trên thanh công cụ để xem vài thông báo mới nhất.",
      },
      {
        title: "Xem đầy đủ",
        body: "Mở trang Thông báo nội bộ từ menu hoặc chuông.",
      },
      {
        title: "Đánh dấu đã đọc",
        body: "Nhấn từng thông báo hoặc Đánh dấu tất cả đã đọc khi xử lý xong.",
      },
    ],
    tips: ["Thông báo chỉ trong phạm vi chi nhánh bạn đang xem."],
  },
  areas: {
    intro: "Cấu hình khu vực trong chi nhánh — mỗi khu vực gắn với nhóm bàn trên Sơ đồ.",
    steps: [
      {
        title: "Mở Khu vực",
        body: "Chọn Khu vực trong menu Cài đặt.",
      },
      {
        title: "Thêm khu vực",
        body: "Thêm, đổi tên hoặc xóa khu vực theo bố cục thực tế của nhà hàng.",
      },
    ],
    tips: ["Đặt tên khu vực rõ ràng để nhân viên chọn đúng trên Sơ đồ."],
  },
  "booking-rules": {
    intro: "Điều chỉnh ngưỡng áp dụng toàn hệ thống cho tab Booking hôm nay.",
    steps: [
      {
        title: "Ngưỡng Đoàn",
        body: "Số khách tối thiểu để tự gắn loại Đoàn.",
      },
      {
        title: "Ngưỡng Khách quen",
        body: "Số lần hoàn thành để coi là khách quen.",
      },
      {
        title: "Cửa sổ Chờ đến",
        body: "Trước/sau giờ hẹn bao nhiêu phút vẫn hiện trạng thái Chờ đến.",
      },
      {
        title: "Thời gian trễ tối đa",
        body: "Quá giờ mà chưa check-in → Trễ; cuối ngày có thể → Không đến.",
      },
    ],
    tips: ["Thay đổi áp dụng cho toàn hệ thống — cân nhắc trước khi lưu."],
  },
  branches: {
    intro: "Quản lý thông tin chi nhánh: tên và địa chỉ.",
    steps: [
      {
        title: "Mở Thông tin chi nhánh",
        body: "Chọn mục này trong menu (Admin / Quản lý tổng).",
      },
      {
        title: "Sửa thông tin",
        body: "Cập nhật tên và địa chỉ chi nhánh đang chọn trên thanh công cụ.",
      },
    ],
    tips: ["Thông tin chính xác giúp nhân viên phân biệt các điểm khi chọn chi nhánh."],
  },
  users: {
    intro: "Tạo và quản lý tài khoản nhân sự, gán vai trò và chi nhánh.",
    steps: [
      {
        title: "Tạo tài khoản",
        body: "Thêm từng người hoặc dán danh sách từ Excel.",
      },
      {
        title: "Gán vai trò và chi nhánh",
        body: "Chọn Admin, Quản lý tổng, Quản lý chi nhánh hoặc Nhân viên. Gán chi nhánh làm việc.",
      },
      {
        title: "Sửa và xóa",
        body: "Đổi tên, mật khẩu, phân quyền hoặc xóa tài khoản không còn dùng.",
      },
    ],
    tips: [
      "Chỉ Admin mới gán được vai trò Admin.",
      "Quản lý tổng không thấy và không chỉnh tài khoản Admin.",
    ],
  },
  account: {
    intro: "Quản lý thông tin cá nhân của bạn trong hệ thống.",
    steps: [
      {
        title: "Mở Tài khoản của tôi",
        body: "Vào từ menu tài khoản góc trên hoặc mục Tài khoản trong menu trái.",
      },
      {
        title: "Xem thông tin",
        body: "Xem vai trò, chi nhánh được gán và lịch sử cập nhật.",
      },
      {
        title: "Đổi họ tên",
        body: "Nhấn Sửa, cập nhật họ tên hiển thị và lưu.",
      },
      {
        title: "Đổi mật khẩu",
        body: "Bật Đổi mật khẩu, nhập mật khẩu hiện tại và mật khẩu mới.",
      },
    ],
    tips: ["Giữ mật khẩu bí mật và không chia sẻ tài khoản."],
  },
};

export function getGuideModuleContent(id: GuideModuleId, role: Role): GuideModuleContent {
  if (id === "your-role") {
    return yourRoleContent(role);
  }
  if (id === "bookings") {
    return bookingsContent(role);
  }
  if (id === "booking-flow") {
    return bookingFlowContent(role);
  }
  if (id === "workflows") {
    return workflowsContent(role);
  }
  if (id === "tips") {
    return tipsContent(role);
  }
  return STATIC_CONTENT[id];
}

export const GUIDE_ALL_ROLES = ALL_ROLES;
