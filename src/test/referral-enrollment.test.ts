import { describe,it,expect } from "vitest";
import { employeeDuplicate, employeeSchema, previewEmployees, signupSchema, storeSignupLink } from "@/lib/referral-enrollment";
const store="74e5e213-2ce1-4494-95ea-2c57c0d02277";
const input={name:"Alex Morgan",store_id:store,role:"Technician",department:"Service",email:"alex@example.com",phone:"214-555-0110"};
const existing=[{employee_name:"Alex Morgan",store_id:store,email:"alex@example.com",phone:"(214) 555-0110"}];
describe("employee enrollment",()=>{
 it("requires first and last name on signup",()=>expect(signupSchema.safeParse({token:store,first:"Alex",last:"",role:"Tech",email:"alex@example.com",phone:""}).success).toBe(false));
 it("requires a role",()=>expect(employeeSchema.safeParse({...input,role:""}).success).toBe(false));
 it("requires either phone or email",()=>{expect(employeeSchema.safeParse({...input,email:"",phone:""}).success).toBe(false);expect(employeeSchema.safeParse({...input,phone:""}).success).toBe(true);expect(employeeSchema.safeParse({...input,email:""}).success).toBe(true);});
 it("matches name and store without changing existing identity",()=>expect(employeeDuplicate({...input,name:" ALEX   MORGAN ",email:"different@example.com",phone:""},existing)).toBe(true));
 it("does not match name alone in a different store",()=>expect(employeeDuplicate({...input,store_id:crypto.randomUUID(),email:"",phone:"817-555-0111"},existing)).toBe(false));
 it("matches email across stores",()=>expect(employeeDuplicate({...input,store_id:crypto.randomUUID(),name:"New Name",email:"ALEX@example.com",phone:""},existing)).toBe(true));
 it("matches normalized phone across stores",()=>expect(employeeDuplicate({...input,store_id:crypto.randomUUID(),name:"New Name",email:"",phone:"+1 214-555-0110"},existing)).toBe(true));
 it("shows unknown-store errors per row",()=>expect(previewEmployees('name,store,role,email\nAlex,Unknown,Tech,alex@example.com',[{id:store,name:"Dallas"}],[])[0]?.status).toBe("error"));
 it("skips duplicates within the CSV",()=>expect(previewEmployees('name,store,role,email\nAlex Morgan,Dallas,Tech,alex@example.com\nAlex Morgan,Dallas,Tech,alex@example.com',[{id:store,name:"Dallas"}],[]).map(r=>r.status)).toEqual(["ready","duplicate"]));
 it("handles quoted comma fields",()=>expect(previewEmployees('name,store,role,email\n"Morgan, Alex",Dallas,Tech,alex@example.com',[{id:store,name:"Dallas"}],[])[0]?.input?.name).toBe("Morgan, Alex"));
 it("previews a group with over 1000 employees",()=>{const csv='name,store,role,email\n'+Array.from({length:1200},(_,i)=>`Employee ${i},Dallas,Tech,employee${i}@example.com`).join('\n');expect(previewEmployees(csv,[{id:store,name:"Dallas"}],[]).filter(r=>r.status==="ready")).toHaveLength(1200);});
 it("keeps store signup separate from existing personal links",()=>expect(storeSignupLink(store)).toBe(`https://workwithwerk.com/refer/join/${store}`));
});