print("ContactVault: A Python Contact Manager")


def display_menu():
    print("Contact Book Menu:")
    print("1. Add Contact")
    print("2. View Contact")
    print("3. Edit Contact")
    print("4. Delete Contact")
    print("5. List All Contacts")
    print("6. Exit")


# add a contact
def add_contact(contact_book):
    name = input("enter contact name:")

    if name in contact_book:
        print("Contact already exists!")
        return

    if name not in contact_book:
        phone = input("enter contact phone to add:")
        email = input("enter contact email to add:")
        address = input("enter contact address to add:")
        contact_book[name] = {
            "phone": phone,
            "email": email,
            "address": address
        }
        return print("Contact added successfully!")


# veiw contact
def view_contact(contact_book):
    name = input("enter contact name:")
    if name in contact_book:

        print("Name:", name)
        print("Phone:", contact_book[name]["phone"])
        print("Email:", contact_book[name]["email"])
        print("Address:", contact_book[name]["address"])
    else:
        print("Contact not found!")


# edits contact
def edit_contact(contact_book):
    name = input("enter contact name:")
    if name in contact_book:
        phone = input("enter contact phone to edit:")
        email = input("enter contact email to edit:")
        address = input("enter contact address to edit:")
        if phone != " " and email != " " and address != " ":
            contact_book[name] = {
                "phone": phone,
                "email": email,
                "address": address
            }
            print("Contact updated successfully!")
        else:
            contact_book[name] = contact_book[name]
    else:
        print("Contact not found!")


# deletes a contact
def delete_contact(contact_book):
    name = input("enter contact name to delete:")
    if name in contact_book:
        contact_book.pop(name)
        print("Contact deleted successfully!")
    else:
        print("Contact not found!")


# list all conacts
def list_all_contacts(contact_book):
    if len(contact_book) == 0:
        print("No contacts available.")
    else:
        for name in contact_book:
            print("Name:", name)
            print("Phone:", contact_book[name]["phone"])
            print("Email:", contact_book[name]["email"])
            print("Address:", contact_book[name]["address"])
            print("")


# add_contact(contact_book)=1
# view_contact(contact_book)=2
# edit_contact(contact_book)=3
# delete_contact(contact_book)=4
# list_all_contacts(contact_book)=5
contact_book = {}
while True:

    display_menu()
    choice = input("choose a number 1-6:")
    if choice == "1":
        add_contact(contact_book)
    elif choice == "2":
        view_contact(contact_book)
    elif choice == "3":
        edit_contact(contact_book)

    elif choice == "4":
        delete_contact(contact_book)

    elif choice == "5":
        list_all_contacts(contact_book)

    elif choice == "6":
        break

    else:
        print("Invalid choice. Please try again.")












