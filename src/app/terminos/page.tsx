import Link from "next/link";
import { PaginaLegal, Seccion } from "@/components/legal";
import { RESPONSABLE } from "@/lib/legal";
import { DIAS_PRUEBA } from "@/lib/planes";

export const metadata = {
  title: "Términos y condiciones",
  description: "Condiciones de uso y de la membresía de Repastos.",
};

export default function Terminos() {
  const r = RESPONSABLE;
  return (
    <PaginaLegal
      titulo="Términos y condiciones"
      resumen={`En pocas palabras: Repastos es una herramienta de apoyo para manejar potreros. Tus datos son tuyos y puedes exportarlos o eliminarlos. La membresía se paga por ganadería, se renueva sola y la puedes cancelar cuando quieras. Las estimaciones y bloqueos por tiempos de espera ayudan, pero la decisión de pastorear, aplicar productos o vender leche o carne es siempre del productor, que debe respetar la etiqueta de cada producto y la normativa vigente.`}
    >
      <Seccion n={1} titulo="Quiénes somos y aceptación">
        <p>
          Repastos (el «Servicio») es prestado por {r.razonSocial}, cédula {r.cedula}, con domicilio en {r.domicilio} («nosotros»).
          Al crear una cuenta o una ganadería, o al usar el Servicio, aceptas estos Términos y nuestra{" "}
          <Link href="/privacidad">Política de privacidad</Link>. Si usas el Servicio en nombre de una empresa o finca,
          declaras que tienes facultades para obligarla.
        </p>
        <p>Debes ser mayor de 18 años y tener capacidad legal para contratar.</p>
      </Seccion>

      <Seccion n={2} titulo="El Servicio">
        <p>
          Repastos es una aplicación web para la gestión de repastos: mapa de potreros, rotaciones, aforos, lluvia, insumos,
          aplicaciones de abonos y agroquímicos con sus tiempos de espera, planificación del pastoreo, producción y reportes.
          Podemos mejorar, cambiar o retirar funciones; si retiramos una función esencial de un plan pagado, te avisaremos con
          al menos 30 días de anticipación.
        </p>
      </Seccion>

      <Seccion n={3} titulo="Tu cuenta">
        <ul>
          <li>Proporciona información verdadera y mantenla actualizada.</li>
          <li>Eres responsable de guardar tu contraseña y de toda la actividad hecha con tu cuenta. Las cuentas son personales: no las compartas.</li>
          <li>Avísanos de inmediato a {r.correoContacto} si sospechas de un acceso no autorizado.</li>
        </ul>
      </Seccion>

      <Seccion n={4} titulo="Ganaderías, equipo y roles">
        <p>
          Cada ganadería es una cuenta de cliente independiente. Quien la crea es su <b>propietario</b> y es el titular de la
          membresía. El propietario y los administradores pueden invitar a otras personas con roles de administrador, operador
          o lector, y son responsables de quién tiene acceso y de retirarlo cuando corresponda. Los datos que el equipo
          registra pertenecen a la ganadería.
        </p>
      </Seccion>

      <Seccion n={5} titulo="Membresía, prueba gratuita y pagos">
        <ul>
          <li>
            <b>Prueba gratuita.</b> Cada ganadería nueva puede usar el Servicio sin costo durante {DIAS_PRUEBA} días, sin
            tarjeta. Al terminar, para seguir registrando datos hay que contratar un plan.
          </li>
          <li>
            <b>Planes y precios.</b> Los planes, sus límites (por ejemplo, número de potreros, fincas o miembros) y precios
            vigentes se muestran antes de contratar. Los precios incluyen o detallan el impuesto al valor agregado según la
            legislación costarricense.
          </li>
          <li>
            <b>Renovación automática.</b> La membresía se cobra por adelantado en cada período (mensual o anual) y se renueva
            automáticamente con el medio de pago registrado hasta que la canceles.
          </li>
          <li>
            <b>Cancelación.</b> Puedes cancelar en cualquier momento; la cancelación surte efecto al final del período ya
            pagado y no se cobran períodos posteriores. Salvo lo que disponga la ley, no se hacen reembolsos proporcionales de
            períodos iniciados.
          </li>
          <li>
            <b>Falta de pago.</b> Si un cobro falla, habrá un período de gracia. Si no se regulariza, la ganadería pasa a modo
            de <b>solo lectura</b>: el equipo puede consultar y exportar sus datos, pero no registrar cambios. No borramos
            datos por falta de pago sin avisar antes al propietario.
          </li>
          <li>
            <b>Cambios de precio.</b> Te avisaremos con al menos 30 días de anticipación; aplicarán a partir de la siguiente
            renovación y podrás cancelar antes si no estás de acuerdo.
          </li>
          <li>
            Los pagos los procesa una pasarela de pago externa; nosotros no almacenamos los datos completos de tu tarjeta.
          </li>
        </ul>
      </Seccion>

      <Seccion n={6} titulo="Uso aceptable">
        <p>No está permitido:</p>
        <ul>
          <li>Acceder o intentar acceder a datos de otras ganaderías o eludir los permisos, límites o medidas de seguridad.</li>
          <li>Hacer pruebas de penetración, escaneos automatizados o cargas excesivas sin nuestra autorización por escrito.</li>
          <li>Subir archivos con código malicioso, contenido ilícito o datos personales de terceros sin base legal para hacerlo.</li>
          <li>Revender, sublicenciar o copiar el Servicio, o usarlo para crear un producto competidor.</li>
          <li>Crear ganaderías o cuentas repetidas para encadenar pruebas gratuitas.</li>
        </ul>
        <p>Si detectas una vulnerabilidad, repórtala a {r.correoContacto}; agradecemos la divulgación responsable.</p>
      </Seccion>

      <Seccion n={7} titulo="Tus datos">
        <p>
          Los datos que tu ganadería registra (fincas, mapas, potreros, rebaños, aplicaciones, producción, archivos) son tuyos.
          Nos das una licencia limitada para almacenarlos, procesarlos y mostrarlos únicamente con el fin de prestarte el
          Servicio, darte soporte y mantener su seguridad. No vendemos tus datos. Podemos generar estadísticas agregadas y
          anónimas, que no permitan identificar a una persona ni a una finca, para mejorar el Servicio.
        </p>
        <p>
          Puedes exportar los datos de tu ganadería en cualquier momento desde Ajustes y el propietario puede eliminar la
          ganadería con todos sus datos. El tratamiento de datos personales se rige por nuestra{" "}
          <Link href="/privacidad">Política de privacidad</Link>.
        </p>
      </Seccion>

      <Seccion n={8} titulo="Recomendaciones, estimaciones y tiempos de espera">
        <p>
          Las estimaciones de forraje, la cuña forrajera, la prioridad de pastoreo, el planificador, las dosis y los bloqueos
          por período de reingreso o retiro de leche y carne son <b>herramientas de apoyo</b> calculadas con los datos que
          ingresas y con modelos generales. Pueden no reflejar la realidad de tu finca.
        </p>
        <ul>
          <li>
            Eres responsable de verificar y cumplir la etiqueta registrada de cada producto, las indicaciones del Servicio
            Fitosanitario del Estado (SFE), del Servicio Nacional de Salud Animal (SENASA), del MAG y de tu profesional
            responsable, así como los períodos de retiro antes de pastorear, ordeñar para la venta o enviar animales a sacrificio.
          </li>
          <li>Los tiempos de espera dependen de los datos que registres: un producto o una fecha mal ingresados producen un cálculo incorrecto.</li>
          <li>El Servicio no sustituye la asesoría de un ingeniero agrónomo, zootecnista o médico veterinario.</li>
        </ul>
      </Seccion>

      <Seccion n={9} titulo="Disponibilidad y soporte">
        <p>
          Procuramos que el Servicio esté disponible de forma continua, pero puede haber interrupciones por mantenimiento,
          fallas de proveedores o causas fuera de nuestro control. El registro de campo sin señal guarda los datos en tu
          teléfono hasta que haya conexión; si borras los datos del navegador antes de sincronizar, esos registros se pierden.
          El soporte se brinda por {r.correoContacto} en días hábiles.
        </p>
      </Seccion>

      <Seccion n={10} titulo="Propiedad intelectual">
        <p>
          El software, el diseño, la marca Repastos y los contenidos del Servicio son de nuestra propiedad o de nuestros
          licenciantes. Estos Términos no te transfieren ningún derecho sobre ellos, salvo el derecho de uso del Servicio
          mientras tu membresía esté vigente. Las imágenes satelitales y datos de terceros se rigen por las condiciones de sus
          proveedores.
        </p>
      </Seccion>

      <Seccion n={11} titulo="Limitación de responsabilidad">
        <p>
          En la medida permitida por la ley, el Servicio se ofrece «tal cual» y no respondemos por daños indirectos, lucro
          cesante, pérdida de producción, de animales o de cosechas, sanciones por residuos en leche o carne, ni por decisiones
          tomadas con base en las estimaciones del Servicio. Nuestra responsabilidad total frente a una ganadería no excederá
          lo que esta nos haya pagado en los 12 meses anteriores al hecho que la origina.
        </p>
        <p>
          Nada en estos Términos limita los derechos irrenunciables que te otorga la Ley de Promoción de la Competencia y
          Defensa Efectiva del Consumidor (Ley N.º 7472) ni otra norma de orden público.
        </p>
      </Seccion>

      <Seccion n={12} titulo="Suspensión y terminación">
        <p>
          Podemos suspender o cerrar una cuenta que incumpla gravemente estos Términos, ponga en riesgo la seguridad del
          Servicio o de otros clientes, o cuando lo ordene una autoridad. Salvo urgencia, avisaremos antes y daremos
          oportunidad de exportar los datos. Puedes dejar de usar el Servicio en cualquier momento.
        </p>
      </Seccion>

      <Seccion n={13} titulo="Cambios a estos Términos">
        <p>
          Podemos actualizar estos Términos. Si el cambio es relevante, lo avisaremos en la aplicación o por correo con al
          menos 15 días de anticipación. Seguir usando el Servicio después de la fecha de vigencia implica aceptar la nueva
          versión.
        </p>
      </Seccion>

      <Seccion n={14} titulo="Ley aplicable y controversias">
        <p>
          Estos Términos se rigen por las leyes de la República de Costa Rica. Antes de acudir a otra vía, escríbenos para
          intentar resolver cualquier diferencia de buena fe. Las controversias se someterán a los tribunales de Costa Rica,
          sin perjuicio de tu derecho a acudir a la Comisión Nacional del Consumidor cuando corresponda.
        </p>
      </Seccion>

      <Seccion n={15} titulo="Contacto">
        <p>{r.razonSocial} · {r.domicilio} · {r.correoContacto}</p>
      </Seccion>
    </PaginaLegal>
  );
}
