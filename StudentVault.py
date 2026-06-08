
School_name=input("Enter School Name: ")
user_name = input("Enter Username: ")
print(f"Welcome {user_name} to your own student manager program for {School_name}")

student_records = {}


def add_student():
    name = input("Enter student name: ")

    if name in student_records:
        print(f"Student '{name}' already exists.")
        return

    age = int(input("Enter age: "))
    courses = input("Enter courses (comma-separated): ").split(",")

    student_records[name] = {
        "age": age,
        "grades": set(),
        "courses": {course.strip() for course in courses}
    }

    print(f"Student '{name}' added successfully.")


def add_grade():
    name = input("Enter student name: ")

    if name not in student_records:
        print("Student not found.")
        return

    grade = float(input("Enter grade: "))
    student_records[name]["grades"].add(grade)

    print("Grade added successfully.")


def view_student():
    name = input("Enter student name: ")

    if name not in student_records:
        print("Student not found.")
        return

    details = student_records[name]

    print("\n--- Student Details ---")
    print(f"Name: {name}")
    print(f"Age: {details['age']}")
    print(f"Courses: {', '.join(details['courses'])}")
    print(f"Grades: {list(details['grades'])}")


def calculate_average_grade():
    name = input("Enter student name: ")

    if name not in student_records:
        print("Student not found.")
        return

    grades = student_records[name]["grades"]

    if not grades:
        print("Average Grade: 0")
        return

    average = sum(grades) / len(grades)
    print(f"Average Grade: {average:.2f}")


def list_students_by_course():
    course = input("Enter course name: ")

    students = []

    for name, details in student_records.items():
        if course in details["courses"]:
            students.append(name)

    if students:
        print("Students enrolled:")
        for student in students:
            print(student)
    else:
        print("No students found.")


def filter_top_students():
    threshold = float(input("Enter minimum average grade: "))

    top_students = []

    for name, details in student_records.items():
        grades = details["grades"]

        if grades:
            average = sum(grades) / len(grades)

            if average > threshold:
                top_students.append(name)

    if top_students:
        print("Top Students:")
        for student in top_students:
            print(student)
    else:
        print("No students meet the criteria.")


def list_all_students():
    if not student_records:
        print("No students available.")
        return

    print("\n--- All Students ---")
    for student in student_records:
        print(student)


while True:
    print("\n===== STUDENTVAULT =====")
    print("1. Add Student")
    print("2. Add Grade")
    print("3. View Student")
    print("4. Calculate Average Grade")
    print("5. List Students by Course")
    print("6. Filter Top Students")
    print("7. List All Students")
    print("8. Exit")

    choice = input("Choose an option (1-8): ")

    if choice == "1":
        add_student()

    elif choice == "2":
        add_grade()

    elif choice == "3":
        view_student()

    elif choice == "4":
        calculate_average_grade()

    elif choice == "5":
        list_students_by_course()

    elif choice == "6":
        filter_top_students()

    elif choice == "7":
        list_all_students()

    elif choice == "8":
        print("Thank you for using StudentVault!")
        break

    else:
        print("Invalid choice. Please try again.")

